export type SourceType = "public" | "firm";

export interface SourceMeta {
  docId: string;
  title: string;
  sourceType: SourceType;
  synthetic: boolean;
  starterNote: boolean;
  publisher?: string;
  url?: string;
  path: string; // relative to /knowledge
}

export interface Chunk {
  id: string; // e.g. "sgb-iv-arbeitgebermeldungen#2"
  docId: string;
  heading: string;
  text: string;
}

/** A retrieved passage as sent to the model and to the UI. */
export interface Passage extends SourceMeta {
  chunkId: string;
  ref: string; // "S1", "S2", ... stable within one response
  heading: string;
  text: string;
  score: number;
}

export type Priority = "low" | "normal" | "high" | "urgent";

export interface CaseFile {
  companyName: string | null;
  legalForm: string | null;
  incorporationDate: string | null;
  registeredOffice: string | null;
  requestedServices: string[];
  employees: string | null;
  payrollRequirements: string | null;
  bookkeepingSoftware: string | null;
  previousAdviser: string | null;
  taxRegistrationStatus: string | null;
  documentsReceived: string[];
  missingDocuments: string[];
  openQuestions: string[];
  caseCategory: string | null;
  priority: Priority | null;
  priorityReason: string | null;
  escalations: string[];
  recommendedNextAction: string | null;
}

export const EMPTY_CASE: CaseFile = {
  companyName: null,
  legalForm: null,
  incorporationDate: null,
  registeredOffice: null,
  requestedServices: [],
  employees: null,
  payrollRequirements: null,
  bookkeepingSoftware: null,
  previousAdviser: null,
  taxRegistrationStatus: null,
  documentsReceived: [],
  missingDocuments: [],
  openQuestions: [],
  caseCategory: null,
  priority: null,
  priorityReason: null,
  escalations: [],
  recommendedNextAction: null,
};

export interface Citation {
  ref: string;
  chunkId: string;
  docId: string;
  title: string;
  sourceType: SourceType;
  synthetic: boolean;
  starterNote: boolean;
  url?: string;
  heading: string;
  excerpt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  grounding?: "grounded" | "workflow" | "not_in_kb";
  escalate?: boolean;
  attachments?: string[];
}

export interface UploadedDoc {
  name: string;
  size: number;
  label: string; // what the client says it is / what we guessed
}

export interface ChatRequest {
  messages: ChatMessage[];
  caseFile: CaseFile;
  uploads: UploadedDoc[];
}

export interface ChatResponse {
  reply: string;
  caseFile: CaseFile | null; // null = keep the current case file
  citations: Citation[];
  grounding: "grounded" | "workflow" | "not_in_kb";
  escalate: boolean;
  mode: "live" | "offline-demo";
  retrieved: number;
}

export interface SummaryResponse {
  summary: string;
  email: string;
  citations: Citation[];
  mode: "live" | "offline-demo";
}
