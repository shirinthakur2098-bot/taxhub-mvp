import fs from "node:fs/promises";
import path from "node:path";
import type { Chunk, Passage, SourceMeta, SourceType } from "./types";

/**
 * Lightweight RAG: read /knowledge (.md, .txt, .pdf), chunk by heading and size,
 * score with BM25. Everything lives in memory; the index is built once per server
 * instance (cold start on Vercel) and reused.
 */

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const MAX_CHUNK_CHARS = 1100;
const SUPPORTED = new Set([".md", ".txt", ".pdf"]);

interface Index {
  docs: Map<string, SourceMeta>;
  chunks: Chunk[];
  termFreqs: Map<string, number>[];
  docFreq: Map<string, number>;
  lengths: number[];
  avgLength: number;
  errors: { path: string; error: string }[];
}

let indexPromise: Promise<Index> | null = null;

export function getIndex(): Promise<Index> {
  if (!indexPromise) {
    indexPromise = buildIndex().catch((err) => {
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

async function walk(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else if (SUPPORTED.has(path.extname(e.name).toLowerCase()) && e.name.toLowerCase() !== "readme.md") {
      files.push(full);
    }
  }
  return files.sort();
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*?)\s*(#.*)?$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: raw.slice(m[0].length) };
}

async function readSidecar(file: string): Promise<Record<string, string>> {
  try {
    const json = JSON.parse(await fs.readFile(file + ".meta.json", "utf8"));
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v)]));
  } catch {
    return {};
  }
}

function buildMeta(rel: string, meta: Record<string, string>): SourceMeta {
  const topFolder = rel.split(/[\\/]/)[0];
  const sourceType: SourceType =
    meta.source_type === "firm" || meta.source_type === "public"
      ? meta.source_type
      : topFolder === "firm"
        ? "firm"
        : "public";
  const docId = rel.replace(/\.[^.]+$/, "").replace(/[\\/]/g, "__");
  return {
    docId,
    title: meta.title || path.basename(rel).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
    sourceType,
    synthetic: meta.synthetic === "true",
    publisher: meta.publisher || undefined,
    url: meta.url || undefined,
    path: rel,
  };
}

/** Split markdown/plain text into sections by heading, then by size. */
function chunkText(docId: string, body: string, fallbackHeading: string): Chunk[] {
  const sections: { heading: string; text: string }[] = [];
  let heading = fallbackHeading;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) sections.push({ heading, text });
    buf = [];
  };
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) {
      flush();
      heading = h[1].trim();
    } else {
      buf.push(line);
    }
  }
  flush();

  const chunks: Chunk[] = [];
  for (const s of sections) {
    for (const piece of splitBySize(s.text)) {
      chunks.push({ id: `${docId}#${chunks.length + 1}`, docId, heading: s.heading, text: piece });
    }
  }
  return chunks;
}

function splitBySize(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const paras = text.split(/\n\s*\n/);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > MAX_CHUNK_CHARS) {
      out.push(cur.trim());
      cur = "";
    }
    if (p.length > MAX_CHUNK_CHARS) {
      // Very long paragraph (common in PDFs): split on sentence boundaries.
      for (const sentence of p.split(/(?<=[.;:])\s+/)) {
        if (cur && cur.length + sentence.length > MAX_CHUNK_CHARS) {
          out.push(cur.trim());
          cur = "";
        }
        cur += sentence + " ";
      }
    } else {
      cur += p + "\n\n";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function loadPdf(file: string): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buf = await fs.readFile(file);
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

async function buildIndex(): Promise<Index> {
  const files = await walk(KNOWLEDGE_DIR);
  const docs = new Map<string, SourceMeta>();
  const chunks: Chunk[] = [];
  const errors: Index["errors"] = [];

  for (const file of files) {
    const rel = path.relative(KNOWLEDGE_DIR, file);
    try {
      if (file.toLowerCase().endsWith(".pdf")) {
        const meta = buildMeta(rel, await readSidecar(file));
        const pages = await loadPdf(file);
        docs.set(meta.docId, meta);
        pages.forEach((pageText, i) => {
          const clean = pageText.replace(/[ \t]+/g, " ").trim();
          if (!clean) return;
          for (const piece of splitBySize(clean)) {
            chunks.push({ id: `${meta.docId}#p${i + 1}-${chunks.length}`, docId: meta.docId, heading: `Page ${i + 1}`, text: piece });
          }
        });
      } else {
        const raw = await fs.readFile(file, "utf8");
        const { meta: fm, body } = parseFrontmatter(raw);
        const meta = buildMeta(rel, fm);
        docs.set(meta.docId, meta);
        chunks.push(...chunkText(meta.docId, body, meta.title));
      }
    } catch (err) {
      errors.push({ path: rel, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Prefix every chunk's indexed text with its document title and heading, so a
  // passage under "Payroll" in the SOP matches "payroll" even if the body doesn't say it.
  const termFreqs = chunks.map((c) => {
    const tf = new Map<string, number>();
    const title = docs.get(c.docId)?.title ?? "";
    for (const t of tokenize(`${title} ${c.heading} ${c.heading} ${c.text}`)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });
  const docFreq = new Map<string, number>();
  for (const tf of termFreqs) for (const t of tf.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  const lengths = termFreqs.map((tf) => [...tf.values()].reduce((a, b) => a + b, 0));
  const avgLength = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);

  return { docs, chunks, termFreqs, docFreq, lengths, avgLength, errors };
}

// ---------------------------------------------------------------------------
// Tokenisation (German + English)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from has have i if in into is it its of on or our so that the their them then there these they this to was we were what when which who will with you your " +
    "aber als am an auch auf aus bei bin bis da das dass dem den der des die dies diese dieser doch du ein eine einem einen einer eines er es für hat haben ich ihr im in ist ja kann mit nach nicht noch nur oder sich sie sind so über um und uns von vor war wir wird zu zum zur"
  ).split(" "),
);

// Clients write in English; much of the source material is German. A small
// bilingual map lets an English question reach German passages (and vice versa).
const SYNONYMS: Record<string, string[]> = {
  employee: ["arbeitnehmer", "lohn", "personal"],
  employees: ["arbeitnehmer", "lohn", "personal"],
  staff: ["arbeitnehmer", "personal"],
  hire: ["arbeitnehmer", "einstellung"],
  payroll: ["lohn", "lohnsteuer", "lohnbuchhaltung", "gehalt"],
  salary: ["gehalt", "lohn"],
  wage: ["lohn", "lohnsteuer"],
  bookkeeping: ["buchführung", "buchhaltung", "finanzbuchhaltung"],
  accounting: ["buchführung", "rechnungswesen"],
  founded: ["gründung", "formation"],
  found: ["gründung"],
  formation: ["gründung"],
  incorporated: ["gründung", "handelsregister"],
  register: ["erfassung", "anmeldung", "handelsregister"],
  registration: ["erfassung", "anmeldung"],
  tax: ["steuer"],
  "tax number": ["steuernummer"],
  vat: ["umsatzsteuer", "ust"],
  deadline: ["frist", "month", "within"],
  due: ["frist", "month"],
  questionnaire: ["fragebogen"],
  finanzamt: ["fragebogen", "erfassung", "notify"],
  submitted: ["fragebogen", "elster", "electronically"],
  "social security": ["sozialversicherung", "betriebsnummer"],
  documents: ["unterlagen", "dokumente"],
  adviser: ["steuerberater"],
  advisor: ["steuerberater"],
  lexoffice: ["datev", "export", "software"],
  software: ["datev"],
};

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

function stem(t: string): string {
  // Deliberately crude: a 6-char prefix merges most inflections
  // (employee/employees, gründung/gründungen, anmeldung/anmeldungen).
  return t.length > 6 ? t.slice(0, 6) : t;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9äöüß§]+/i)) {
    if (!raw || raw.length < 2 || STOPWORDS.has(raw)) continue;
    out.push(stem(normalise(raw)));
  }
  return out;
}

function expandQuery(query: string): string {
  const lower = query.toLowerCase();
  const extra: string[] = [];
  for (const [k, vs] of Object.entries(SYNONYMS)) {
    if (new RegExp(`\\b${k}\\b`).test(lower)) extra.push(...vs);
  }
  return `${query} ${extra.join(" ")}`;
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

const K1 = 1.4;
const B = 0.75;

export interface SearchOptions {
  limit?: number;
  sourceType?: SourceType;
  docId?: string;
}

export async function search(query: string, opts: SearchOptions = {}): Promise<Omit<Passage, "ref">[]> {
  const idx = await getIndex();
  const terms = [...new Set(tokenize(expandQuery(query)))];
  const N = idx.chunks.length;
  const scored: { i: number; score: number }[] = [];

  idx.chunks.forEach((chunk, i) => {
    const meta = idx.docs.get(chunk.docId)!;
    if (opts.sourceType && meta.sourceType !== opts.sourceType) return;
    if (opts.docId && chunk.docId !== opts.docId) return;
    const tf = idx.termFreqs[i];
    let score = 0;
    for (const t of terms) {
      const f = tf.get(t);
      if (!f) continue;
      const df = idx.docFreq.get(t) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * idx.lengths[i]) / idx.avgLength)));
    }
    if (score > 0) scored.push({ i, score });
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, opts.limit ?? 6).map(({ i, score }) => {
    const c = idx.chunks[i];
    return { ...idx.docs.get(c.docId)!, chunkId: c.id, heading: c.heading, text: c.text, score: Math.round(score * 100) / 100 };
  });
}

/**
 * Retrieve from public and firm sources separately so the model always sees
 * both the authoritative material and the firm's own workflow rules, each
 * clearly labelled. Returns passages numbered S1..Sn.
 */
export async function retrieveForCase(query: string, publicLimit = 5, firmLimit = 3): Promise<Passage[]> {
  const [pub, firm] = await Promise.all([
    search(query, { sourceType: "public", limit: publicLimit }),
    search(query, { sourceType: "firm", limit: firmLimit }),
  ]);
  return [...pub, ...firm].map((p, i) => ({ ...p, ref: `S${i + 1}` }));
}

export async function listKnowledge() {
  const idx = await getIndex();
  const counts = new Map<string, number>();
  for (const c of idx.chunks) counts.set(c.docId, (counts.get(c.docId) ?? 0) + 1);
  return {
    documents: [...idx.docs.values()].map((d) => ({ ...d, chunks: counts.get(d.docId) ?? 0 })),
    totalChunks: idx.chunks.length,
    errors: idx.errors,
  };
}
