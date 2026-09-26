import Anthropic from "@anthropic-ai/sdk";
import {
  INTAKE_OUTPUT_SCHEMA,
  INTAKE_SYSTEM_PROMPT,
  SUMMARY_OUTPUT_SCHEMA,
  SUMMARY_SYSTEM_PROMPT,
  buildIntakeTurn,
  buildSummaryTurn,
} from "./prompts";
import { type CaseFile, type ChatMessage, type Citation, EMPTY_CASE, type Passage, type UploadedDoc } from "./types";

// claude-opus-5 is a current production model ID on the Claude API.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
type Effort = "low" | "medium" | "high";
const EFFORT_OVERRIDE = process.env.TAXHUB_EFFORT as Effort | undefined;
// Intake turns are short extraction + questions, so they default to low effort to keep
// the chat responsive; the one-off handover summary gets a bit more thinking.
const INTAKE_EFFORT: Effort = EFFORT_OVERRIDE || "low";
const SUMMARY_EFFORT: Effort = EFFORT_OVERRIDE || "medium";
let fallbacksOn = process.env.TAXHUB_DISABLE_FALLBACKS !== "true";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export class RefusalError extends Error {}

async function createMessage(
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  schema: object,
  effort: Effort,
  withFallbacks: boolean,
) {
  return getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort, format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    // Stable system prompt is cached; per-turn context lives in the last user message.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    // Server-side refusal fallback (beta): if the primary model declines, the API
    // re-runs the request on Anthropic's recommended fallback model.
    ...(withFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
}

async function callJson<T>(system: string, messages: Anthropic.Beta.BetaMessageParam[], schema: object, effort: Effort): Promise<T> {
  let response;
  try {
    response = await createMessage(system, messages, schema, effort, fallbacksOn);
  } catch (err) {
    // The fallback parameter is a beta. If this account or model rejects it, retry
    // without it rather than failing the client's turn. If the retry succeeds,
    // skip the beta for the rest of this server instance's life.
    if (fallbacksOn && err instanceof Anthropic.BadRequestError) {
      response = await createMessage(system, messages, schema, effort, false);
      fallbacksOn = false;
      console.warn("[taxhub] Refusal-fallback beta rejected; continuing without it:", err.message);
    } else {
      throw err;
    }
  }

  if (response.stop_reason === "refusal") {
    throw new RefusalError("The model declined this request. Please rephrase, or contact an adviser directly.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The model response was cut off (max_tokens). Try again.");
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as T;
}

/**
 * The model cites whichever passage refs it used (e.g. S2, S5, S7). Renumber them
 * S1..Sn in order of first appearance so the client sees 1, 2, 3.
 */
export function renumberCitations(text: string, citations: Citation[]): { text: string; citations: Citation[] } {
  const order: string[] = [];
  for (const m of text.matchAll(/\[(S\d+)\]/g)) if (!order.includes(m[1])) order.push(m[1]);
  for (const c of citations) if (!order.includes(c.ref)) order.push(c.ref);
  const map = new Map(order.map((ref, i) => [ref, `S${i + 1}`]));
  return {
    text: text.replace(/\[(S\d+)\]/g, (m, ref) => (map.has(ref) ? `[${map.get(ref)}]` : m)),
    citations: citations
      .map((c) => ({ ...c, ref: map.get(c.ref) ?? c.ref }))
      .sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1))),
  };
}

// ---------------------------------------------------------------------------

export function toCitations(passages: Passage[], refs: string[], alsoFromText = ""): Citation[] {
  const wanted = new Set(refs);
  for (const m of alsoFromText.matchAll(/\[(S\d+)\]/g)) wanted.add(m[1]);
  return passages
    .filter((p) => wanted.has(p.ref))
    .map((p) => ({
      ref: p.ref,
      chunkId: p.chunkId,
      docId: p.docId,
      title: p.title,
      sourceType: p.sourceType,
      synthetic: p.synthetic,
      url: p.url,
      heading: p.heading,
      excerpt: readableExcerpt(p.text),
    }));
}

/** Turn a markdown chunk into a short, readable excerpt (tables → "a · b · c" lines). */
function readableExcerpt(text: string): string {
  const clean = text
    .split("\n")
    .filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l))
    .map((l) => l.replace(/^\s*\|\s*|\s*\|\s*$/g, "").replace(/\s*\|\s*/g, " · ").replace(/\*\*/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean.length > 420 ? clean.slice(0, 420).trimEnd() + "…" : clean;
}

/** Drop [S#] markers that don't correspond to a passage we actually supplied. */
export function stripUnknownRefs(text: string, passages: Passage[]): string {
  const known = new Set(passages.map((p) => p.ref));
  return text.replace(/\s?\[(S\d+)\]/g, (m, ref) => (known.has(ref) ? m : ""));
}

function sanitiseCase(raw: Partial<CaseFile> | undefined, previous: CaseFile): CaseFile {
  const merged = { ...EMPTY_CASE, ...previous, ...(raw ?? {}) } as CaseFile;
  for (const k of ["requestedServices", "documentsReceived", "missingDocuments", "openQuestions", "escalations"] as const) {
    if (!Array.isArray(merged[k])) merged[k] = [];
  }
  if (merged.priority && !["low", "normal", "high", "urgent"].includes(merged.priority)) merged.priority = null;
  return merged;
}

export async function runIntakeTurn(opts: {
  history: ChatMessage[];
  clientMessage: string;
  caseFile: CaseFile;
  uploads: UploadedDoc[];
  passages: Passage[];
  today: string;
}) {
  // Prior turns go in as plain text; only the current turn carries the full context block.
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.history.map((m) => ({ role: m.role, content: m.content }));
  messages.push({
    role: "user",
    content: buildIntakeTurn({
      today: opts.today,
      caseFile: opts.caseFile,
      uploads: opts.uploads,
      passages: opts.passages,
      clientMessage: opts.clientMessage,
    }),
  });

  const out = await callJson<{
    reply: string;
    grounding: "grounded" | "workflow" | "not_in_kb";
    citedRefs: string[];
    escalate: boolean;
    caseFile: CaseFile;
  }>(INTAKE_SYSTEM_PROMPT, messages, INTAKE_OUTPUT_SCHEMA, INTAKE_EFFORT);

  const stripped = stripUnknownRefs(out.reply, opts.passages);
  // Only list sources the reply actually cites inline, numbered 1..n.
  const { text: reply, citations } = renumberCitations(stripped, toCitations(opts.passages, [], stripped));
  return {
    reply,
    grounding: out.grounding,
    escalate: Boolean(out.escalate),
    caseFile: sanitiseCase(out.caseFile, opts.caseFile),
    citations,
  };
}

export async function runSummary(opts: {
  caseFile: CaseFile;
  uploads: UploadedDoc[];
  passages: Passage[];
  messages: ChatMessage[];
  today: string;
}) {
  const out = await callJson<{ adviserBriefing: string; nextActions: string[]; email: string; citedRefs: string[] }>(
    SUMMARY_SYSTEM_PROMPT,
    [{ role: "user", content: buildSummaryTurn(opts) }],
    SUMMARY_OUTPUT_SCHEMA,
    SUMMARY_EFFORT,
  );
  const briefing = stripUnknownRefs(out.adviserBriefing, opts.passages);
  const nextActions = out.nextActions.map((a) => stripUnknownRefs(a, opts.passages));
  return {
    adviserBriefing: briefing,
    nextActions,
    email: out.email.replace(/\s?\[S\d+\]/g, ""),
    citations: toCitations(opts.passages, out.citedRefs ?? [], briefing + nextActions.join(" ")),
  };
}
