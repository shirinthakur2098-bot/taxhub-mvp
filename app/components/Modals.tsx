"use client";

import { useEffect, useState } from "react";
import type { SourceMeta, SummaryResponse } from "@/lib/types";
import { SourceBadges } from "./SourceBadges";

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SummaryModal({ data, caseId, onClose }: { data: SummaryResponse; caseId: string; onClose: () => void }) {
  const [tab, setTab] = useState<"summary" | "email">("summary");
  const [copied, setCopied] = useState(false);
  const text = tab === "summary" ? data.summary : data.email;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Adviser handover · {caseId}</h3>
          <div className="tabs" style={{ marginLeft: 12 }}>
            <button className={`tab ${tab === "summary" ? "active" : ""}`} onClick={() => setTab("summary")}>Adviser handover</button>
            <button className={`tab ${tab === "email" ? "active" : ""}`} onClick={() => setTab("email")}>Draft client email</button>
          </div>
          <span className="spacer" />
          {data.mode === "offline-demo" && <span className="badge badge-warn">Offline demo – scripted text</span>}
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          {tab === "email" && (
            <p className="hint" style={{ marginTop: 0 }}>
              Draft only. An adviser reviews and sends it – TaxHub never emails clients directly.
            </p>
          )}
          <pre className={`doc-pre ${tab === "email" ? "doc-email" : ""}`}>{text}</pre>
        </div>
        <div className="modal-foot">
          <span className="hint" style={{ marginRight: "auto" }}>Plain text – paste into DATEV DMS, a ticket, or an internal email.</span>
          <button
            className="btn"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button className="btn btn-primary" onClick={() => download(`${caseId}-${tab}.txt`, text)}>Download .txt</button>
        </div>
      </div>
    </div>
  );
}

type KbDoc = SourceMeta & { chunks: number };
type KbHit = SourceMeta & { chunkId: string; heading: string; text: string; score: number };

export function KnowledgeModal({ onClose }: { onClose: () => void }) {
  const [docs, setDocs] = useState<KbDoc[] | null>(null);
  const [info, setInfo] = useState<{ totalChunks: number; errors: { path: string; error: string }[] } | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<KbHit[] | null>(null);

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((d) => {
        setDocs(d.documents);
        setInfo({ totalChunks: d.totalChunks, errors: d.errors });
      });
  }, []);

  const runSearch = async () => {
    if (!q.trim()) return setHits(null);
    const r = await fetch(`/api/knowledge?q=${encodeURIComponent(q)}`);
    setHits((await r.json()).results);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Knowledge base</h3>
          {info && <span className="hint">{docs?.length} documents · {info.totalChunks} chunks indexed from /knowledge</span>}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <p className="hint" style={{ marginTop: 0 }}>
            Every answer is grounded in these files. Add .md, .txt or .pdf files to <code>/knowledge/public</code> (official sources) or{" "}
            <code>/knowledge/firm</code> (internal SOPs) and restart. See <code>knowledge/README.md</code>.
          </p>
          {info?.errors.length ? (
            <div className="error-banner" style={{ margin: "0 0 10px" }}>
              Failed to ingest: {info.errors.map((e) => `${e.path} (${e.error})`).join(", ")}
            </div>
          ) : null}

          <div className="kb-search">
            <input
              placeholder="Test retrieval, e.g. “Betriebsnummer” or “Fragebogen deadline”"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
            <button className="btn" onClick={runSearch}>Search</button>
          </div>

          {hits ? (
            <div className="kb-list">
              {hits.length === 0 && <div className="empty-note">No matching passages.</div>}
              {hits.map((h) => (
                <div className="kb-item" key={h.chunkId}>
                  <div className="kb-item-top">
                    <strong>{h.title}</strong>
                    <SourceBadges source={h} />
                    <span className="spacer" />
                    <span className="badge badge-neutral">BM25 {h.score}</span>
                  </div>
                  <div className="kb-path">{h.heading}</div>
                  <div className="source-excerpt" style={{ marginTop: 6 }}>{h.text.slice(0, 500)}{h.text.length > 500 ? "…" : ""}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="kb-list">
              {!docs && <div className="empty-note">Loading…</div>}
              {docs?.map((d) => (
                <div className="kb-item" key={d.docId}>
                  <div className="kb-item-top">
                    <strong>{d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : d.title}</strong>
                    <SourceBadges source={d} />
                  </div>
                  <div className="kb-path">knowledge/{d.path} · {d.chunks} chunks{d.publisher ? ` · ${d.publisher}` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
