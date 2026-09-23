import { search } from "./knowledge";
import { DEMO_STEPS, normaliseForMatch } from "./demoScript";
import { toCitations } from "./llm";
import type { CaseFile, ChatResponse, Passage, SummaryResponse, UploadedDoc } from "./types";
import { composeSummary } from "./summary";

/**
 * OFFLINE DEMO MODE (no ANTHROPIC_API_KEY).
 *
 * Replies and case-file snapshots for the seeded GmbH scenario are scripted so
 * the demo works without an API key or network. Citations are NOT scripted:
 * each {{doc|query}} placeholder runs a real BM25 search over /knowledge and
 * cites whatever passage it finds. If you delete or replace a knowledge file,
 * the offline citations change accordingly (or disappear).
 */

const DOC = {
  ao: "public__tax-law__ao-137-138-anzeigepflichten",
  elster: "public__elster__elster-fragebogen-steuerliche-erfassung-gmbh",
  estg: "public__tax-law__estg-41a-lohnsteuer-anmeldung",
  hgb: "public__tax-law__hgb-gmbhg-buchfuehrungspflicht",
  sgb: "public__tax-law__sgb-iv-arbeitgebermeldungen",
  datev: "public__datev__datev-public-workflow-overview",
  sop: "firm__muster-partner-new-gmbh-intake-sop",
} as const;

const SOP_DOCS_ALL = [
  "D1 Articles of association (Gesellschaftsvertrag / notarielle Urkunde)",
  "D2 Commercial register extract, or notary's filing confirmation while entry is pending",
  "D3 Shareholder list (Gesellschafterliste)",
  "D4 Proof of share capital payment (bank statement)",
  "D5 Trade registration (Gewerbeanmeldung), if applicable",
  "D6 ID copy of managing director(s)",
  "D7 Transparency register confirmation",
  "D8 Employment contracts (one per employee)",
  "D9 Employee master data sheet (Personalfragebogen)",
  "D10 Tax ID and social security number per employee",
];

const base: CaseFile = {
  companyName: null,
  legalForm: "GmbH",
  incorporationDate: "approx. 2026-09-02 (client: \"three weeks ago\")",
  registeredOffice: null,
  requestedServices: ["Bookkeeping (Finanzbuchhaltung)", "Payroll (Lohnbuchhaltung)", "Tax registration (Fragebogen zur steuerlichen Erfassung)"],
  employees: "2 – starting next month (approx. October 2026)",
  payrollRequirements: "2 employees from next month; employment types, salaries and Betriebsnummer status unknown",
  bookkeepingSoftware: "Lexoffice",
  previousAdviser: null,
  taxRegistrationStatus: "Not registered – nothing submitted to the Finanzamt yet; no tax number",
  documentsReceived: [],
  missingDocuments: SOP_DOCS_ALL,
  openQuestions: [
    "Exact company name and registered office",
    "Exact notarisation date and Handelsregister status (HRB no.)",
    "Shareholders and managing director(s)",
    "Employment type, start date and gross salary per employee",
    "Betriebsnummer requested?",
    "Previous tax adviser?",
    "Expected turnover in founding year and following year",
  ],
  caseCategory: "NG-01 New GmbH – formation support · tags: BK, PR",
  priority: "high",
  priorityReason: "Company founded ~3 weeks ago and the Fragebogen zur steuerlichen Erfassung has not been submitted (SOP escalation rule).",
  escalations: ["Fragebogen not submitted and company founded ~3 weeks ago – adviser to confirm the statutory deadline"],
  recommendedNextAction:
    "Complete company master data, then have an adviser confirm the registration deadline and prepare the Fragebogen zur steuerlichen Erfassung via ELSTER.",
};

const step2: CaseFile = {
  ...base,
  companyName: "Nordlicht Digital GmbH",
  registeredOffice: "Hamburg",
  incorporationDate: "2026-09-02 (notarisation); Handelsregister entry pending",
  openQuestions: [
    "Employment type, start date and gross salary per employee",
    "Betriebsnummer requested?",
    "Previous tax adviser?",
    "Expected turnover in founding year and following year",
    "Business purpose and start of operations",
  ],
  escalations: [
    ...base.escalations,
    "Managing director is also sole shareholder – social-security status assessment needed",
  ],
};

const step3: CaseFile = {
  ...step2,
  employees: "2 – both starting 2026-10-01",
  payrollRequirements:
    "1× full-time developer (€4,200 gross/month), 1× part-time office assistant (€1,800 gross/month); first payroll October 2026; no Betriebsnummer yet",
  previousAdviser: "None – first company",
  openQuestions: [
    "Expected turnover in founding year and following year",
    "Business purpose and start of operations",
    "Business bank account and Lexoffice DATEV export set-up",
    "Health insurer per employee",
  ],
  escalations: [
    ...step2.escalations,
    "First payroll run due within ~30 days and no Betriebsnummer",
  ],
  recommendedNextAction:
    "Adviser to (1) confirm deadline and submit the Fragebogen via ELSTER, (2) arrange the Betriebsnummer request before the October payroll, (3) assess the managing director's social-security status.",
};

const step4: CaseFile = {
  ...step3,
  documentsReceived: [
    "Articles of association (Gesellschaftsvertrag_Nordlicht_Digital_GmbH.pdf)",
    "Notary's Handelsregister filing confirmation (Notar_Anmeldung_Handelsregister.pdf)",
    "Shareholder list (Gesellschafterliste.pdf)",
  ],
  missingDocuments: [
    "D4 Proof of share capital payment (client: follows next week)",
    "D5 Trade registration (Gewerbeanmeldung), if applicable",
    "D6 ID copy of managing director",
    "D7 Transparency register confirmation",
    "D8 Employment contracts (2)",
    "D9 Employee master data sheets (2)",
    "D10 Tax ID and social security number per employee",
  ],
  recommendedNextAction:
    "Assign to adviser today. Priorities: submit the Fragebogen via ELSTER, request the Betriebsnummer before 1 October payroll, assess managing-director social-security status, then send engagement letter and Vollmacht (D11).",
};

interface Step {
  reply: string;
  caseFile: CaseFile;
  grounding: ChatResponse["grounding"];
  escalate: boolean;
}

const STEPS: Step[] = [
  {
    reply: `Thank you – that gives me a clear picture. I've opened a case for a newly founded GmbH that needs bookkeeping and payroll support {{sop|case categories new GmbH bookkeeping payroll}}.

One point to flag straight away: a GmbH has to notify the Finanzamt of its founding within one month {{ao|GmbH Gründung notify within one month}}, and the Fragebogen zur steuerlichen Erfassung must be submitted electronically via ELSTER {{elster|Fragebogen Kapitalgesellschaft ELSTER where to find}}. As the company was founded about three weeks ago and nothing has been submitted yet, I've marked this as high priority for your adviser, who will confirm the exact deadline {{sop|escalation rules Fragebogen not submitted three weeks}}.

To complete your case, could you tell me:
1. The exact company name and registered office (Sitz)?
2. The date of the notary appointment, and whether the Handelsregister entry has already happened?
3. Are you the sole shareholder and managing director, or are there others?`,
    caseFile: base,
    grounding: "grounded",
    escalate: true,
  },
  {
    reply: `Thanks – noted: Nordlicht Digital GmbH, Hamburg, notarised on 2 September 2026, Handelsregister entry pending.

Because you are both shareholder and managing director, your social-security status needs a proper assessment. That's something your adviser will look at personally, so I've flagged it rather than answering it here {{sop|managing director also shareholder social-security escalation}}.

Next, about your two employees:
1. When exactly do they start, and are they full-time, part-time or Minijob?
2. What is the planned gross monthly salary for each?
3. Does the GmbH already have a Betriebsnummer from the Bundesagentur für Arbeit? It's needed before employees can be registered for social security {{sgb|Betriebsnummer Bundesagentur}}.`,
    caseFile: step2,
    grounding: "grounded",
    escalate: true,
  },
  {
    reply: `Got it. With the first payroll in October and no Betriebsnummer yet, timing matters: the Betriebsnummer comes from the Bundesagentur für Arbeit and employees can only be registered once it exists {{sgb|Betriebsnummer registration employees Einzugsstelle}}. I've flagged this for your adviser {{sop|first payroll run due within 30 days Betriebsnummer}}. Once payroll runs, the GmbH will also file a Lohnsteuer-Anmeldung by the 10th day after each reporting period {{estg|Lohnsteuer-Anmeldung 10th day obligation}}; your adviser will set up the right period.

On bookkeeping: a GmbH has to keep proper books from the start {{hgb|obligation to keep books merchant}}. Since you use Lexoffice, your adviser will discuss whether you keep booking there and send us a DATEV export, or whether we take over the bookkeeping {{datev|Lexoffice DATEV export third-party software}}.

To finish the intake, please upload:
1. Articles of association (notarielle Urkunde)
2. The notary's Handelsregister filing confirmation
3. Shareholder list (Gesellschafterliste)
4. Proof of share capital payment
{{sop|required documents articles of association register extract shareholder list}}`,
    caseFile: step3,
    grounding: "grounded",
    escalate: true,
  },
  {
    reply: `Thank you – I've received all three documents and added them to your case. The proof of share capital payment is noted as following next week.

Your case is now complete enough to hand over. An adviser will review it, contact you about the tax registration and the Betriebsnummer, and send you the engagement letter and power of attorney {{sop|handover to the adviser engagement letter}}.

Still outstanding, no rush today: ID copy of the managing director, transparency register confirmation, trade registration if applicable, and for payroll the two employment contracts and employee data sheets.`,
    caseFile: step4,
    grounding: "workflow",
    escalate: false,
  },
];

async function resolvePlaceholders(template: string) {
  const passages: Passage[] = [];
  const byChunk = new Map<string, string>();
  const matches = [...template.matchAll(/\s?\{\{(\w+)\|([^}]+)\}\}/g)];
  let out = template;
  for (const m of matches) {
    const docId = DOC[m[1] as keyof typeof DOC];
    const [hit] = docId ? await search(m[2], { docId, limit: 1 }) : [];
    if (!hit) {
      out = out.replace(m[0], "");
      continue;
    }
    let ref = byChunk.get(hit.chunkId);
    if (!ref) {
      ref = `S${passages.length + 1}`;
      byChunk.set(hit.chunkId, ref);
      passages.push({ ...hit, ref });
    }
    out = out.replace(m[0], ` [${ref}]`);
  }
  return { text: out, passages };
}

export async function offlineChat(userMessages: string[], uploads: UploadedDoc[]): Promise<ChatResponse> {
  const stepIdx = userMessages.length - 1;
  const latest = userMessages[stepIdx] ?? "";
  const scripted = DEMO_STEPS[stepIdx];
  const onScript =
    scripted &&
    userMessages.every((m, i) => DEMO_STEPS[i] && normaliseForMatch(m) === normaliseForMatch(DEMO_STEPS[i].message));

  if (!onScript) {
    // Off-script: still show what retrieval finds, but be explicit that no AI is running.
    const hits = await search(latest, { limit: 3 });
    const passages = hits.map((h, i) => ({ ...h, ref: `S${i + 1}` }));
    const reply =
      `TaxHub is running in offline demo mode (no ANTHROPIC_API_KEY set), so I can only play the scripted GmbH scenario and can't interpret new messages.\n\n` +
      (passages.length
        ? `For reference, these knowledge-base passages best match your message: ${passages.map((p) => `[${p.ref}]`).join(" ")}. I'm not drawing any conclusions from them.`
        : `I found no knowledge-base passages matching your message.`) +
      `\n\nClick "Reset" and "Play demo", or add an API key for live mode.`;
    return {
      reply,
      caseFile: null,
      citations: toCitations(passages, passages.map((p) => p.ref)),
      grounding: "not_in_kb",
      escalate: false,
      mode: "offline-demo",
      retrieved: passages.length,
    };
  }

  const step = STEPS[stepIdx];
  const { text, passages } = await resolvePlaceholders(step.reply);
  void uploads;
  return {
    reply: text,
    caseFile: step.caseFile,
    citations: toCitations(passages, passages.map((p) => p.ref)),
    grounding: step.grounding,
    escalate: step.escalate,
    mode: "offline-demo",
    retrieved: passages.length,
  };
}

const OFFLINE_EMAIL = `Subject: Your new client case – Nordlicht Digital GmbH

Dear client,

thank you for choosing Muster & Partner Steuerberatung and for the information you've provided so far.

We have received:
1. Articles of association
2. The notary's Handelsregister filing confirmation
3. Shareholder list

To complete your file, please send us:
1. Proof of share capital payment (bank statement)
2. A copy of your ID as managing director
3. Confirmation of the transparency register entry
4. Your trade registration (Gewerbeanmeldung), if applicable
5. For each employee: employment contract, completed employee data sheet, tax ID and social security number

We still need a few details from you:
1. Expected turnover for 2026 and 2027
2. Business purpose and start of operations
3. Your business bank account and whether Lexoffice's DATEV export is set up
4. Each employee's health insurer

Because your company was founded recently and your first payroll is due on 1 October, your case has been assigned high priority. An adviser will contact you shortly about the tax registration with the Finanzamt and the Betriebsnummer for your employees, and will send you our engagement letter and power of attorney.

Kind regards
Your team at Muster & Partner Steuerberatung`;

export async function offlineSummary(caseFile: CaseFile, uploads: UploadedDoc[], sourcesUsed: SummaryResponse["citations"]): Promise<SummaryResponse> {
  const { text: briefing, passages } = await resolvePlaceholders(
    `New GmbH (NG-01, tags BK/PR) founded ~3 weeks ago with no tax registration yet; the Fragebogen zur steuerlichen Erfassung is due within one month of the reportable event {{ao|within one month Fragebogen electronic}} and must go via ELSTER {{elster|Fragebogen Kapitalgesellschaft legal basis}}. Two employees start 1 October but there is no Betriebsnummer {{sgb|Betriebsnummer}}. The sole shareholder is also managing director, which triggers a social-security status check under our SOP {{sop|escalation rules managing director shareholder}}. Deadlines rely on starter notes – verify against the statute.`,
  );
  const nextActions = [
    "Confirm the registration deadline and submit the Fragebogen zur steuerlichen Erfassung via ELSTER.",
    "Request the Betriebsnummer from the Bundesagentur für Arbeit before the October payroll.",
    "Assess the managing director's social-security status.",
    "Agree the bookkeeping set-up (Lexoffice + DATEV export vs. firm bookkeeping).",
    "Send engagement letter and Vollmacht (D11).",
  ];
  const briefingCitations = toCitations(passages, passages.map((p) => p.ref));
  return {
    summary: composeSummary({
      caseFile,
      uploads,
      briefing,
      nextActions,
      email: OFFLINE_EMAIL,
      sources: sourcesUsed,
      briefingCitations,
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    }),
    email: OFFLINE_EMAIL,
    citations: briefingCitations,
    mode: "offline-demo",
  };
}
