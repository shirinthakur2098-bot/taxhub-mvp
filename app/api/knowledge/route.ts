import { NextResponse } from "next/server";
import { listKnowledge, search } from "@/lib/knowledge";
import { MODEL, hasApiKey } from "@/lib/llm";

export const runtime = "nodejs";

/** GET /api/knowledge – indexed documents. GET /api/knowledge?q=...[&type=public|firm] – raw retrieval results. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q");
  const type = params.get("type");
  if (q) {
    const sourceType = type === "public" || type === "firm" ? type : undefined;
    return NextResponse.json({ query: q, results: await search(q, { limit: 8, sourceType }) });
  }
  return NextResponse.json({ ...(await listKnowledge()), mode: hasApiKey() ? "live" : "offline-demo", model: hasApiKey() ? MODEL : null });
}
