"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEMO_STEPS } from "@/lib/demoScript";
import { type CaseFile, type ChatMessage, type ChatResponse, type Citation, EMPTY_CASE, type SummaryResponse, type UploadedDoc } from "@/lib/types";
import { CaseFilePanel } from "./components/CaseFilePanel";
import { Chat } from "./components/Chat";
import { KnowledgeModal, SummaryModal } from "./components/Modals";
import { SourceLegend } from "./components/SourceBadges";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newCaseId() {
  return `TH-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

function diffKeys(a: CaseFile, b: CaseFile): Set<string> {
  const out = new Set<string>();
  for (const k of Object.keys(b) as (keyof CaseFile)[]) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.add(k);
  }
  return out;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [caseFile, setCaseFile] = useState<CaseFile>(EMPTY_CASE);
  const [uploads, setUploads] = useState<UploadedDoc[]>([]);
  const [pending, setPending] = useState<UploadedDoc[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [allCitations, setAllCitations] = useState<Citation[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [showKb, setShowKb] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [mode, setMode] = useState<{ mode: "live" | "offline-demo"; model: string | null } | null>(null);
  const [caseId, setCaseId] = useState("TH-····");
  const cancelDemo = useRef(false);

  // Case ID is random, so generate it after hydration to avoid a server/client mismatch.
  useEffect(() => setCaseId(newCaseId()), []);
  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((d) => setMode({ mode: d.mode, model: d.model }))
      .catch(() => {});
  }, []);

  const sources = useMemo(() => {
    const seen = new Map<string, Citation>();
    for (const c of allCitations) if (!seen.has(c.docId)) seen.set(c.docId, c);
    return [...seen.values()].sort((a, b) => (a.sourceType === b.sourceType ? 0 : a.sourceType === "public" ? -1 : 1));
  }, [allCitations]);

  // Refs let the demo loop read the latest state between awaits.
  const stateRef = useRef({ messages, caseFile, uploads });
  stateRef.current = { messages, caseFile, uploads };

  const send = useCallback(async (text: string, attach: UploadedDoc[]) => {
    const { messages: prev, caseFile: currentCase, uploads: prevUploads } = stateRef.current;
    const content = text.trim() || `I've uploaded: ${attach.map((a) => a.label).join(", ")}.`;
    const userMsg: ChatMessage = { role: "user", content, attachments: attach.map((a) => a.name) };
    const nextMessages = [...prev, userMsg];
    const nextUploads = [...prevUploads, ...attach];
    setMessages(nextMessages);
    setUploads(nextUploads);
    setDraft("");
    setPending([]);
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          caseFile: currentCase,
          uploads: nextUploads,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const r = data as ChatResponse;
      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        { role: "assistant", content: r.reply, citations: r.citations, grounding: r.grounding, escalate: r.escalate },
      ];
      setMessages(finalMessages);
      if (r.caseFile) {
        setChanged(diffKeys(currentCase, r.caseFile));
        setCaseFile(r.caseFile);
        setTimeout(() => setChanged(new Set()), 2400);
      }
      setAllCitations((c) => [...c, ...r.citations]);
      stateRef.current = { messages: finalMessages, caseFile: r.caseFile ?? currentCase, uploads: nextUploads };
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    cancelDemo.current = true;
    setMessages([]);
    setCaseFile(EMPTY_CASE);
    setUploads([]);
    setPending([]);
    setDraft("");
    setError(null);
    setAllCitations([]);
    setSummary(null);
    setCaseId(newCaseId());
  };

  const playDemo = async () => {
    reset();
    await sleep(50);
    cancelDemo.current = false;
    setDemoRunning(true);
    try {
      for (const step of DEMO_STEPS) {
        if (step.uploads) {
          setPending(step.uploads);
          await sleep(900);
        }
        // Type the message so the audience can read it.
        for (let i = 1; i <= step.message.length; i += 3) {
          if (cancelDemo.current) return;
          setDraft(step.message.slice(0, i));
          await sleep(12);
        }
        setDraft(step.message);
        await sleep(400);
        if (cancelDemo.current) return;
        const ok = await send(step.message, step.uploads ?? []);
        if (!ok || cancelDemo.current) return;
        await sleep(2200);
      }
    } finally {
      setDemoRunning(false);
    }
  };

  const generateSummary = async () => {
    setSummaryBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseFile,
          uploads,
          messages: messages.map(({ role, content }) => ({ role, content })),
          sourcesUsed: sources,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setSummary(data as SummaryResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate summary");
    } finally {
      setSummaryBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <div className="logo-mark">TH</div>
          TaxHub
        </div>
        <div className="topbar-sub">
          Client intake · <strong>Muster &amp; Partner Steuerberatung</strong> <span className="badge badge-synthetic">fictional demo firm</span>
        </div>
        <span className="spacer" />
        {mode && (
          <span className={`mode-pill ${mode.mode === "live" ? "mode-live" : "mode-offline"}`} title={mode.mode === "live" ? "Claude API connected" : "No ANTHROPIC_API_KEY – scripted replies, real retrieval"}>
            <span className="dot" />
            {mode.mode === "live" ? `Live AI · ${mode.model}` : "Offline demo mode"}
          </span>
        )}
        <button className="btn btn-ghost" onClick={() => setShowKb(true)}>📚 Knowledge base</button>
        <button className="btn" onClick={reset} disabled={busy}>Reset</button>
        <button className="btn btn-primary" onClick={playDemo} disabled={busy || demoRunning}>
          {demoRunning ? "Demo running…" : "▶ Play demo"}
        </button>
      </header>

      <div className="positioning">
        <span>
          TaxHub prepares cases <strong>before DATEV</strong>. It collects information and documents and hands over to an adviser – it does not give tax advice.
        </span>
        <span className="spacer" />
        <SourceLegend />
      </div>

      <main className="workspace">
        <Chat
          messages={messages}
          busy={busy}
          error={error}
          draft={draft}
          setDraft={setDraft}
          pending={pending}
          setPending={setPending}
          onSend={() => {
            if (!draft.trim() && pending.length === 0) return;
            send(draft, pending);
          }}
          onPlayDemo={playDemo}
          demoRunning={demoRunning}
          offline={mode?.mode === "offline-demo"}
        />
        <CaseFilePanel
          caseFile={caseFile}
          changed={changed}
          sources={sources}
          caseId={caseId}
          onSummary={generateSummary}
          canSummarise={messages.length >= 2 && !busy}
          summaryBusy={summaryBusy}
        />
      </main>

      {summary && <SummaryModal data={summary} caseId={caseId} onClose={() => setSummary(null)} />}
      {showKb && <KnowledgeModal onClose={() => setShowKb(false)} />}
    </div>
  );
}
