"use client";

import type { CaseFile, Citation } from "@/lib/types";
import { SourceBadges, hostOf } from "./SourceBadges";

const MASTER_FIELDS: { key: keyof CaseFile; label: string; wide?: boolean }[] = [
  { key: "companyName", label: "Client / company" },
  { key: "legalForm", label: "Legal form" },
  { key: "incorporationDate", label: "Incorporation / start date" },
  { key: "registeredOffice", label: "Registered office" },
  { key: "requestedServices", label: "Requested services", wide: true },
  { key: "employees", label: "Number of employees" },
  { key: "bookkeepingSoftware", label: "Bookkeeping software" },
  { key: "payrollRequirements", label: "Payroll requirements", wide: true },
  { key: "previousAdviser", label: "Previous tax adviser" },
  { key: "taxRegistrationStatus", label: "Tax number / registration status" },
];

function isFilled(v: unknown) {
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

function Field({ label, value, flash, wide }: { label: string; value: unknown; flash: boolean; wide?: boolean }) {
  return (
    <div className={`field ${wide ? "wide" : ""} ${flash ? "flash" : ""}`}>
      <div className="field-label">{label}</div>
      {Array.isArray(value) ? (
        value.length ? (
          <div className="chips">
            {value.map((v) => (
              <span className="chip" key={v}>{v}</span>
            ))}
          </div>
        ) : (
          <div className="field-value empty">Not yet known</div>
        )
      ) : value ? (
        <div className="field-value">{String(value)}</div>
      ) : (
        <div className="field-value empty">Not yet known</div>
      )}
    </div>
  );
}

function Checklist({ items, kind, empty }: { items: string[]; kind: "ok" | "missing" | "q" | "flag"; empty: string }) {
  if (!items.length) return <div className="empty-note">{empty}</div>;
  const icon = { ok: "✓", missing: "", q: "?", flag: "!" }[kind];
  return (
    <ul className="checklist">
      {items.map((i) => (
        <li key={i}>
          <span className={`icon icon-${kind}`}>{icon}</span>
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

export function CaseFilePanel(props: {
  caseFile: CaseFile;
  changed: Set<string>;
  sources: Citation[];
  caseId: string;
  onSummary: () => void;
  canSummarise: boolean;
  summaryBusy: boolean;
}) {
  const c = props.caseFile;
  const filled = MASTER_FIELDS.filter((f) => isFilled(c[f.key])).length;
  const docTotal = c.documentsReceived.length + c.missingDocuments.length;
  // Completeness blends master data (60%) and documents (40%).
  const pct = Math.round((filled / MASTER_FIELDS.length) * 60 + (docTotal ? (c.documentsReceived.length / docTotal) * 40 : 0));
  const f = (k: string) => props.changed.has(k);

  return (
    <section className="pane" style={{ background: "var(--bg)" }}>
      <div className="pane-head">
        <span className="pane-title">Live case file</span>
        <span className="pane-note">What the adviser sees · updates as the client answers</span>
      </div>

      <div className="case-scroll">
        <div className={`case-hero ${f("companyName") || f("caseCategory") ? "flash" : ""}`}>
          <div className="case-hero-top">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="case-id">CASE {props.caseId} · Intake</div>
              <div className={`case-name ${c.companyName ? "" : "placeholder"}`}>{c.companyName ?? "New client enquiry"}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {c.caseCategory ? <span className="badge badge-neutral">{c.caseCategory}</span> : <span className="badge badge-neutral">Uncategorised</span>}
                {c.escalations.length > 0 && <span className="badge badge-danger">⚑ {c.escalations.length} escalation{c.escalations.length > 1 ? "s" : ""}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="field-label">Priority</div>
              <span className={`badge priority priority-${c.priority ?? "low"} ${f("priority") ? "flash" : ""}`} title={c.priorityReason ?? ""}>
                {c.priority ?? "—"}
              </span>
            </div>
          </div>
          {c.priorityReason && <div className="hint" style={{ marginTop: 8 }}>{c.priorityReason}</div>}
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
          <div className="progress-label">
            <span>Case completeness</span>
            <span>{filled}/{MASTER_FIELDS.length} fields · {c.documentsReceived.length}/{docTotal || "–"} documents</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">Client &amp; engagement</div>
          <div className="card-body fields">
            {MASTER_FIELDS.map((fd) => (
              <Field key={fd.key} label={fd.label} value={c[fd.key]} flash={f(fd.key)} wide={fd.wide} />
            ))}
          </div>
        </div>

        <div className="two-col">
          <div className={`card ${f("documentsReceived") ? "flash" : ""}`}>
            <div className="card-head">Documents received <span className="count">{c.documentsReceived.length}</span></div>
            <div className="card-body"><Checklist items={c.documentsReceived} kind="ok" empty="Nothing uploaded yet" /></div>
          </div>
          <div className={`card ${f("missingDocuments") ? "flash" : ""}`}>
            <div className="card-head">Missing documents <span className="count">{c.missingDocuments.length}</span></div>
            <div className="card-body"><Checklist items={c.missingDocuments} kind="missing" empty="None identified yet" /></div>
          </div>
        </div>

        <div className="two-col">
          <div className={`card ${f("openQuestions") ? "flash" : ""}`}>
            <div className="card-head">Open questions <span className="count">{c.openQuestions.length}</span></div>
            <div className="card-body"><Checklist items={c.openQuestions} kind="q" empty="None" /></div>
          </div>
          <div className={`card ${f("escalations") ? "flash" : ""}`}>
            <div className="card-head">Escalate to adviser <span className="count">{c.escalations.length}</span></div>
            <div className="card-body"><Checklist items={c.escalations} kind="flag" empty="No escalation triggers" /></div>
          </div>
        </div>

        <div className={`next-action ${f("recommendedNextAction") ? "flash" : ""}`}>
          <div className="field-label">Recommended next action</div>
          <div className={`field-value ${c.recommendedNextAction ? "" : "empty"}`}>{c.recommendedNextAction ?? "Waiting for client information"}</div>
        </div>

        <div className="card">
          <div className="card-head">Sources used <span className="count">{props.sources.length}</span></div>
          <div className="card-body">
            {props.sources.length === 0 ? (
              <div className="empty-note">No sources cited yet</div>
            ) : (
              <ul className="checklist">
                {props.sources.map((s) => (
                  <li key={s.docId} style={{ flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600 }}>{s.title}</span>
                    <SourceBadges source={s} />
                    {s.url && (
                      <a className="source-link" href={s.url} target="_blank" rel="noreferrer">
                        {hostOf(s.url)} ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="case-foot">
        <span className="hint">Adviser handover</span>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={props.onSummary} disabled={!props.canSummarise || props.summaryBusy}>
          {props.summaryBusy ? "Preparing handover…" : "Create adviser handover & client email"}
        </button>
      </div>
    </section>
  );
}
