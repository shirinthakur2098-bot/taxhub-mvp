import type { UploadedDoc } from "./types";

/** The seeded demo conversation: what the "client" types, step by step. */
export const DEMO_STEPS: { message: string; uploads?: UploadedDoc[] }[] = [
  {
    message:
      "I founded a GmbH three weeks ago. We use Lexoffice, I have two employees starting next month, and I need help with bookkeeping and payroll. We haven't submitted anything to the Finanzamt yet.",
  },
  {
    message:
      "The company is called Nordlicht Digital GmbH, registered in Hamburg. The notary appointment was on 2 September 2026 and the Handelsregister entry is still pending. I'm the sole shareholder and managing director.",
  },
  {
    message:
      "Both start on 1 October. One full-time developer at €4,200 gross per month and a part-time office assistant at €1,800. We don't have a Betriebsnummer yet. And no previous tax adviser – this is my first company.",
  },
  {
    message:
      "I've uploaded the articles of association, the notary's filing confirmation and the shareholder list. The bank statement for the share capital will follow next week.",
    uploads: [
      { name: "Gesellschaftsvertrag_Nordlicht_Digital_GmbH.pdf", size: 412_000, label: "Articles of association (Gesellschaftsvertrag / notarielle Urkunde)" },
      { name: "Notar_Anmeldung_Handelsregister.pdf", size: 188_000, label: "Notary's Handelsregister filing confirmation" },
      { name: "Gesellschafterliste.pdf", size: 96_000, label: "Shareholder list (Gesellschafterliste)" },
    ],
  },
];

export const normaliseForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
