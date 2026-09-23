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

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const EFFORT = (process.env.TAXHUB_EFFORT || "medium") as "low" | "medium" | "high";
const FALLBACKS_ON = process.env.TAXHUB_DISABLE_FALLBACKS !== "true";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export class RefusalError extends Error {}

async function callJson<T>(system: string, messages: Anthropic.Beta.BetaMessageParam[], schema: object): Promise<T> {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    // Stable system prompt is cached; per-turn context lives in the last user message.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    // Server-side refusal fallback (beta): if the primary model declines, the API
    // re-runs the request on Anthropic's recommended fallback model.
    ...(FALLBACKS_ON ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });

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
      starterNote: p.starterNote,
      url: p.url,
      heading: p.heading,
      excerpt: p.text.length > 420 ? p.text.slice(0, 420).trimEnd() + "…" : p.text,
    }));
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
  }>(INTAKE_SYSTEM_PROMPT, messages, INTAKE_OUTPUT_SCHEMA);

  const reply = stripUnknownRefs(out.reply, opts.passages);
  return {
    reply,
    grounding: out.grounding,
    escalate: Boolean(out.escalate),
    caseFile: sanitiseCase(out.caseFile, opts.caseFile),
    citations: toCitations(opts.passages, out.citedRefs ?? [], reply),
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
