import { NextResponse } from "next/server";
import { retrieveForCase } from "@/lib/knowledge";
import { describeError } from "@/lib/errors";
import { hasApiKey, runIntakeTurn } from "@/lib/llm";
import { offlineChat } from "@/lib/offline";
import { type ChatRequest, type ChatResponse, EMPTY_CASE } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || !last.content?.trim()) {
    return NextResponse.json({ error: "Last message must be a non-empty client message" }, { status: 400 });
  }
  const caseFile = { ...EMPTY_CASE, ...(body.caseFile ?? {}) };
  const uploads = Array.isArray(body.uploads) ? body.uploads : [];

  if (!hasApiKey()) {
    const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
    return NextResponse.json(await offlineChat(userMessages, uploads));
  }

  // Retrieval query: the client's message plus what we already know, so short
  // answers ("Hamburg, 2 Sept") still retrieve passages relevant to the case.
  const query = [
    last.content,
    caseFile.legalForm,
    caseFile.caseCategory,
    ...caseFile.requestedServices,
    ...uploads.map((u) => u.label),
  ]
    .filter(Boolean)
    .join(" ");
  const passages = await retrieveForCase(query);

  try {
    const result = await runIntakeTurn({
      history: messages.slice(0, -1),
      clientMessage: last.content,
      caseFile,
      uploads,
      passages,
      today: new Date().toISOString().slice(0, 10),
    });
    const response: ChatResponse = { ...result, mode: "live", retrieved: passages.length };
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 502 });
  }
}
