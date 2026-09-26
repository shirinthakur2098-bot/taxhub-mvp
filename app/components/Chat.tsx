"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { ChatMessage, Citation, UploadedDoc } from "@/lib/types";
import { SourceList, refNum } from "./SourceBadges";

export const DOC_TYPES = [
  "Articles of association (Gesellschaftsvertrag / notarielle Urkunde)",
  "Commercial register extract / notary's filing confirmation",
  "Shareholder list (Gesellschafterliste)",
  "Proof of share capital payment (bank statement)",
  "Trade registration (Gewerbeanmeldung)",
  "ID copy of managing director",
  "Transparency register confirmation",
  "Employment contract",
  "Employee master data sheet (Personalfragebogen)",
  "Letter from the Finanzamt",
  "Other document",
];

const GUESSES: [RegExp, number][] = [
  [/gesellschaftsvertrag|satzung|articles|urkunde/i, 0],
  [/handelsregister|hr[-_ ]?auszug|register[-_ ]?extract|notar/i, 1],
  [/gesellschafterliste|shareholder/i, 2],
  [/stammkapital|einzahlung|kontoauszug|capital|bank/i, 3],
  [/gewerbe/i, 4],
  [/ausweis|passport|reisepass|\bid\b/i, 5],
  [/transparenz/i, 6],
  [/arbeitsvertrag|employment|contract/i, 7],
  [/personalfragebogen|personal/i, 8],
  [/finanzamt|bescheid|steuernummer/i, 9],
];

export function guessDocType(name: string): string {
  for (const [re, i] of GUESSES) if (re.test(name)) return DOC_TYPES[i];
  return DOC_TYPES[DOC_TYPES.length - 1];
}

// ---------------------------------------------------------------------------

function MessageText({ text, citations, onCite }: { text: string; citations?: Citation[]; onCite: (ref: string) => void }) {
  const byRef = new Map((citations ?? []).map((c) => [c.ref, c]));
  const parts = text.split(/(\s?\[S\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\s?\[(S\d+)\]$/);
        if (!m) return <Fragment key={i}>{p}</Fragment>;
        const c = byRef.get(m[1]);
        if (!c) return null;
        return (
          <button key={i} className={`cite cite-${c.sourceType}`} title={c.title} onClick={() => onCite(m[1])}>
            {refNum(m[1])}
          </button>
        );
      })}
    </>
  );
}

function AssistantMessage({ msg }: { msg: ChatMessage }) {
  const [active, setActive] = useState<string | null>(null);
  const citations = msg.citations ?? [];

  return (
    <div className="msg msg-assistant">
      <div className="avatar">TH</div>
      <div className="bubble">
        <MessageText text={msg.content} citations={citations} onCite={(ref) => setActive(active === ref ? null : ref)} />
        <div className="msg-meta">
          {msg.grounding === "grounded" && <span className="badge badge-ok">✓ Grounded in cited sources</span>}
          {msg.grounding === "workflow" && <span className="badge badge-neutral">Firm workflow · no tax facts</span>}
          {msg.grounding === "not_in_kb" && <span className="badge badge-warn">Not covered by knowledge base</span>}
          {msg.escalate && <span className="badge badge-danger">⚑ Flagged for human adviser</span>}
        </div>
        {citations.length > 0 && <SourceList citations={citations} active={active} onSelect={setActive} />}
      </div>
    </div>
  );
}

export function Chat(props: {
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  draft: string;
  setDraft: (s: string) => void;
  pending: UploadedDoc[];
  setPending: (docs: UploadedDoc[]) => void;
  onSend: () => void;
  onPlayDemo: () => void;
  onInsertSample: () => void;
  demoRunning: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [props.messages, props.busy]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const docs = [...files].map((f) => ({ name: f.name, size: f.size, label: guessDocType(f.name) }));
    props.setPending([...props.pending, ...docs]);
  };

  return (
    <section className="pane">
      <div className="pane-head">
        <span className="pane-title">Client conversation</span>
        <span className="pane-note">What the client sees</span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {props.messages.length === 0 && (
          <div className="empty-chat">
            <h2>Welcome to Muster &amp; Partner</h2>
            <p>
              Tell us about your situation in your own words. Our assistant will ask what&apos;s missing, request the right documents and
              prepare your case for an adviser.
            </p>
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={props.onPlayDemo} disabled={props.demoRunning}>
                ▶ Run sample case
              </button>
              <button className="btn" onClick={props.onInsertSample} disabled={props.demoRunning}>
                Insert sample message
              </button>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>Sample: a founder with a three-week-old GmbH, Lexoffice and two new employees.</p>
          </div>
        )}

        {props.messages.map((m, i) =>
          m.role === "assistant" ? (
            <AssistantMessage key={i} msg={m} />
          ) : (
            <div key={i} className="msg msg-user">
              <div className="avatar">You</div>
              <div className="bubble">
                {m.content}
                {m.attachments && m.attachments.length > 0 && (
                  <div className="attach-list">
                    {m.attachments.map((a) => (
                      <span key={a} className="attach-chip">📎 {a}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {props.busy && (
          <div className="msg msg-assistant">
            <div className="avatar">TH</div>
            <div className="bubble" style={{ display: "flex", alignItems: "center" }}>
              <span className="typing"><span /><span /><span /></span>
              <span className="typing-label">Searching knowledge base and updating case file…</span>
            </div>
          </div>
        )}
      </div>

      {props.error && <div className="error-banner">{props.error}</div>}

      <div className="composer">
        <div
          className={`dropzone ${drag ? "drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <span>📎</span>
          <span>
            Drop documents here or{" "}
            <label>
              browse
              <input type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <span className="pane-note"> · PDF, images, Office files</span>
          </span>
        </div>

        {props.pending.length > 0 && (
          <div className="pending-files">
            {props.pending.map((d, i) => (
              <div key={i} className="pending-file">
                <span>📄</span>
                <span className="name" title={d.name}>{d.name}</span>
                <select
                  value={d.label}
                  onChange={(e) => props.setPending(props.pending.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <button className="btn btn-ghost" onClick={() => props.setPending(props.pending.filter((_, j) => j !== i))} aria-label="Remove">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="input-row">
          <textarea
            rows={2}
            placeholder="Describe your situation…"
            value={props.draft}
            onChange={(e) => props.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                props.onSend();
              }
            }}
            disabled={props.busy || props.demoRunning}
          />
          <button
            className="btn btn-primary"
            onClick={props.onSend}
            disabled={props.busy || props.demoRunning || (!props.draft.trim() && props.pending.length === 0)}
          >
            Send
          </button>
        </div>
        <div className="composer-hint">
          Files stay in your browser – only file names and document types are shared with the assistant. Not tax advice; an adviser reviews every case.
        </div>
      </div>
    </section>
  );
}
