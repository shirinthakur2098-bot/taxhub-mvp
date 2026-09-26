import type { CaseFile, Citation, UploadedDoc } from "./types";

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "— not yet provided");
const list = (items: string[], empty = "none") => (items.length ? items.map((i) => `- ${i}`).join("\n") : `- ${empty}`);

export function sourceLabel(c: Pick<Citation, "sourceType" | "synthetic">): string {
  if (c.sourceType === "public") return "Official / public";
  return c.synthetic ? "Internal firm – synthetic demo" : "Internal firm";
}

export function uniqueSources(citations: Citation[]): Citation[] {
  const seen = new Map<string, Citation>();
  for (const c of citations) if (!seen.has(c.docId)) seen.set(c.docId, c);
  return [...seen.values()];
}

/**
 * The adviser handover is assembled from the structured case file, so every field
 * is exactly what the adviser saw in the live case panel. The model only
 * contributes the briefing, the action list and the email draft.
 *
 * Citations: the briefing/actions cite per-request refs ([S2], [S5]). Those are
 * rewritten to [1], [2], … matching the numbered SOURCES list at the end, which
 * also includes every source cited during the conversation.
 */
export function composeSummary(opts: {
  caseId: string;
  caseFile: CaseFile;
  uploads: UploadedDoc[];
  briefing: string;
  nextActions: string[];
  sources: Citation[];
  /** Citations whose [S#] refs appear in briefing / nextActions. */
  briefingCitations: Citation[];
  generatedAt: string;
}): string {
  const c = opts.caseFile;
  const received = c.documentsReceived.length ? c.documentsReceived : opts.uploads.map((u) => `${u.label} (${u.name})`);

  // Number sources in order of first citation in the briefing/actions, then the
  // rest of the sources used in the conversation.
  const byRef = new Map(opts.briefingCitations.map((bc) => [bc.ref, bc]));
  const citedOrder: Citation[] = [];
  for (const m of [opts.briefing, ...opts.nextActions].join(" ").matchAll(/\[(S\d+)\]/g)) {
    const bc = byRef.get(m[1]);
    if (bc) citedOrder.push(bc);
  }
  const sources = uniqueSources([...citedOrder, ...opts.briefingCitations, ...opts.sources]);
  const numOf = (docId: string) => sources.findIndex((s) => s.docId === docId) + 1;
  const renumber = (t: string) =>
    t.replace(/\s?\[(S\d+)\]/g, (_m, ref) => (byRef.has(ref) ? ` [${numOf(byRef.get(ref)!.docId)}]` : "")).replace(/(\[\d+\])(?: \1)+/g, "$1");

  const payroll = [c.employees, c.payrollRequirements].filter(Boolean).join("; ");

  return `TAXHUB ADVISER HANDOVER
Case ${opts.caseId} · generated ${opts.generatedAt}
Category: ${dash(c.caseCategory)}
Priority: ${c.priority ? c.priority.toUpperCase() : "— not yet set"}${c.priorityReason ? ` – ${c.priorityReason}` : ""}

CLIENT CASE
Client / company:         ${dash(c.companyName)}
Legal form:               ${dash(c.legalForm)}
Incorporation / start:    ${dash(c.incorporationDate)}
Registered office:        ${dash(c.registeredOffice)}
Requested services:       ${c.requestedServices.length ? c.requestedServices.join("; ") : "— not yet provided"}
Employees / payroll:      ${dash(payroll)}
Bookkeeping software:     ${dash(c.bookkeepingSoftware)}
Previous adviser:         ${dash(c.previousAdviser)}
Tax registration status:  ${dash(c.taxRegistrationStatus)}

ADVISER BRIEFING
${renumber(opts.briefing)}

ESCALATION FLAGS (adviser judgment required)
${list(c.escalations)}

DOCUMENTS RECEIVED
${list(received)}

MISSING DOCUMENTS
${list(c.missingDocuments)}

OPEN QUESTIONS
${list(c.openQuestions)}

RECOMMENDED NEXT ACTION
${opts.nextActions.length ? opts.nextActions.map((a, i) => `${i + 1}. ${renumber(a)}`).join("\n") : dash(c.recommendedNextAction)}

SOURCES
${
  sources.length
    ? sources.map((s, i) => `[${i + 1}] ${s.title}\n    ${sourceLabel(s)}${s.url ? ` · ${s.url}` : ""}`).join("\n")
    : "- none cited"
}

---
Prepared by TaxHub for internal adviser review. TaxHub collects and structures information; it does not provide tax advice.`;
}
