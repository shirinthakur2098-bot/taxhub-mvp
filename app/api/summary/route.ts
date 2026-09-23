import { NextResponse } from "next/server";
import { describeError } from "@/lib/errors";
import { retrieveForCase } from "@/lib/knowledge";
import { hasApiKey, runSummary } from "@/lib/llm";
import { offlineSummary } from "@/lib/offline";
import { composeSummary } from "@/lib/summary";
import { type CaseFile, type ChatMessage, type Citation, EMPTY_CASE, type SummaryResponse, type UploadedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { caseFile?: CaseFile; messages?: ChatMessage[]; uploads?: UploadedDoc[]; sourcesUsed?: Citation[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const caseFile = { ...EMPTY_CASE, ...(body.caseFile ?? {}) };
  const messages = body.messages ?? [];
  const uploads = body.uploads ?? [];
  const sourcesUsed = body.sourcesUsed ?? [];

  if (!hasApiKey()) {
    if (caseFile.companyName !== "Nordlicht Digital GmbH") {
      return NextResponse.json(
        { error: "Offline demo mode can only summarise the scripted demo case. Add ANTHROPIC_API_KEY for live summaries." },
        { status: 400 },
      );
    }
    return NextResponse.json(await offlineSummary(caseFile, uploads, sourcesUsed));
  }

  const query = [
    caseFile.caseCategory,
    caseFile.legalForm,
    caseFile.taxRegistrationStatus,
    caseFile.payrollRequirements,
    ...caseFile.requestedServices,
    ...caseFile.escalations,
    "handover to the adviser required documents",
  ]
    .filter(Boolean)
    .join(" ");
  const passages = await retrieveForCase(query, 5, 4);

  try {
    const out = await runSummary({ caseFile, uploads, passages, messages, today: new Date().toISOString().slice(0, 10) });
    const response: SummaryResponse = {
      summary: composeSummary({
        caseFile,
        uploads,
        briefing: out.adviserBriefing,
        nextActions: out.nextActions,
        email: out.email,
        sources: sourcesUsed,
        briefingCitations: out.citations,
        generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      }),
      email: out.email,
      citations: out.citations,
      mode: "live",
    };
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 502 });
  }
}
