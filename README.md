# TaxHub

AI-native client intake for German tax advisory firms. A client describes their situation in plain language; TaxHub works out what kind of case it is, asks only for what's missing, requests the right documents, and builds a structured, adviser-ready case file as the conversation goes. Every factual statement cites the knowledge base.

TaxHub sits **before and around DATEV**. It does not replace DATEV and it does not give tax advice: it turns messy client communication into clean work for a human adviser.

## Case Study Scope

TaxHub is intentionally a thin workflow slice, not a complete tax platform. Its purpose is to demonstrate:

1. **Unstructured client communication** – a client writes in their own words, in a chat.
2. **AI clarification and information extraction** – TaxHub pulls out what's already known and asks only for what's missing.
3. **Grounded knowledge retrieval** – factual statements cite official sources (AO, EStG, SGB IV, HGB/GmbHG, GewO, ELSTER, DATEV) or the firm's own SOP, and say so when the knowledge base doesn't cover something.
4. **Structured case creation** – a live case file fills in as the conversation goes: master data, services, payroll, tax registration status, documents, open questions, priority.
5. **Human adviser escalation** – judgment calls (social-security status, deadlines for this specific client, anything the SOP flags) go to an adviser rather than being answered.
6. **Handoff into existing tax-firm workflows such as DATEV** – a plain-text adviser handover to paste into DATEV DMS, a ticket or an internal email, plus a draft client email.

## Known MVP Limitations

- Uploaded files are tracked by file name and document type; their contents are not parsed.
- No direct DATEV integration yet – the handover is copy/paste or download.
- No authentication or persistence – a conversation lives in the browser tab and is gone on reload.
- Live AI requires `ANTHROPIC_API_KEY`. Without it, only the scripted sample case runs (offline demo).
- The Muster & Partner Steuerberatung firm and its intake SOP are synthetic demonstration content.


## Quick start

```bash
npm install
cp .env.example .env.local      # add your ANTHROPIC_API_KEY (optional, see below)
npm run dev                     # http://localhost:3000
```

Click **▶ Run sample case** to play the new-GmbH scenario (or **Insert sample message** to send it yourself), then **Create adviser handover & client email**.

Production build: `npm run build && npm start`. Type check: `npm run typecheck` (the build also type-checks). There is no separate linter configured.

## Environment variables

| Variable | Required | Default | What it does |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | For Live AI | – | Claude API key from https://console.anthropic.com. Without it the app falls back to the **offline demo**. |
| `ANTHROPIC_MODEL` | No | `claude-opus-5` | Model used for intake and summaries. |
| `TAXHUB_EFFORT` | No | chat `low`, handover `medium` | `low` / `medium` / `high`. Setting it applies the same effort to both. `low` answers faster; `high` extracts more carefully. |
| `TAXHUB_DISABLE_FALLBACKS` | No | `false` | TaxHub sends `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): if the model declines a request, the API retries it on Anthropic's recommended fallback model. If the API rejects the beta, TaxHub retries without it automatically; set to `true` to never send it. |

That's all. No database, no auth, no other services.

### Live AI vs. offline demo

The header shows which mode is active.

- **Live AI** (`ANTHROPIC_API_KEY` set) – the product. Every turn retrieves passages from `/knowledge`, sends them with the current case file to Claude, and gets back the reply, cited references and the updated case file as schema-validated JSON.
- **Offline demo** (no key) – a fallback so the sample case can still be shown without a key or network. Replies and case-file snapshots for the sample case are scripted, but the citations are produced by real retrieval over `/knowledge`. Anything off-script gets an honest "no AI running" reply. An amber banner says so whenever this mode is active.

## How it works

```
Client message ──► /api/chat
                     │ 1. BM25 search over /knowledge
                     │    (top 5 public passages + top 3 firm passages, labelled S1..S8)
                     │ 2. Claude: system prompt (guardrails) + history
                     │    + current case file + uploads + passages
                     │ 3. Structured output: { reply, grounding, citedRefs, escalate, caseFile }
                     │ 4. Server drops any [S#] the model cites that it wasn't given,
                     │    then renumbers the rest 1, 2, 3 in order of appearance
                     ▼
UI: chat bubble with numbered citations and a source list
    (title · Official / public or Internal firm · link) · case file diff-highlighted

"Generate summary" ──► /api/summary
                     │ retrieval on the case profile → Claude writes briefing,
                     │ next actions and client email → server assembles the
                     ▼ handover document from the structured case file,
                       with citations mapped to a numbered SOURCES list
```

Design choices worth knowing:

- **Retrieval is BM25, not embeddings.** No vector DB, no second API key, deterministic, and good enough for a few hundred pages. A small EN↔DE synonym map lets an English question ("payroll", "employees") reach German passages ("Lohnsteuer", "Arbeitnehmer"). Public and firm sources are retrieved separately so the model always sees both, labelled.
- **The case file is authoritative.** The final summary's fields are copied from the structured case file, not re-generated, so what the adviser downloads matches what they saw on screen.
- **Citations are verified server-side.** A reference the model invents is removed before the client sees it.
- **Uploads are metadata only.** Files stay in the browser; the assistant sees file name and document type. That's enough for document tracking and avoids storing client documents in a demo. (Reading PDF contents is the obvious next step.)

## Knowledge base

```
knowledge/
├── README.md                  ← where to put which official documents
├── public/                    ← shown as "Official / public"
│   ├── elster/                  ELSTER Fragebogen (Kapitalgesellschaft)
│   ├── tax-law/                 AO §§137/138, EStG §41a, HGB/GmbHG, SGB IV, GewO §14
│   └── datev/                   DATEV public workflow overview
└── firm/                      ← shown as "Internal firm"
    └── muster-partner-new-gmbh-intake-sop.md   ← SYNTHETIC demo SOP
```

Drop in `.md`, `.txt` or `.pdf` files and restart. Folder decides public vs. firm; frontmatter (or a `.meta.json` sidecar for PDFs) sets title, URL and `synthetic: true`. Details: **[knowledge/README.md](knowledge/README.md)**.

The public files are source-grounded notes on the official texts, each linking to its source. The firm SOP is synthetic and labelled that way everywhere it appears.

Check what's indexed and test retrieval in the app (**📚 Knowledge base**) or at `GET /api/knowledge` and `GET /api/knowledge?q=Betriebsnummer`.

## Source labelling in the UI

| Badge | Meaning |
|---|---|
| **Official / public** (blue) | Statutes, authority guidance, vendor docs – from `knowledge/public/` |
| **Internal firm** (purple) | The firm's own workflow – from `knowledge/firm/` |
| **Synthetic demo** (amber) | Fictional content (the Muster & Partner SOP, the firm name in the header) |

Citations appear as numbers in the text; each assistant message lists its sources below it (title, category, link), and clicking a number shows the cited passage. Each assistant message also carries a grounding badge: *Grounded in cited sources*, *Firm workflow · no tax facts*, or *Not covered by knowledge base*, plus *Flagged for human adviser* when an escalation rule fires.

## Guardrails

Enforced in the system prompt (`lib/prompts.ts`) and in code:

- Factual statements must cite a supplied passage; unknown references are stripped server-side.
- If the knowledge base doesn't cover a question, TaxHub says so and adds it to the open questions instead of guessing.
- It may state what a source says in general, but not turn that into a conclusion about the client ("you are late", "you are exempt").
- Simple intake and process questions are answered directly, without disclaimer padding; caution is reserved for judgment calls.
- Law/official guidance and firm workflow are worded and badged differently.
- Escalation triggers (tax optimisation, binding statements, cross-border, missed deadlines, managing-shareholder social-security status, and anything in the firm SOP) are flagged for a human, not answered.
- The draft email is a draft. TaxHub never contacts clients.

## Deploy to Vercel

1. Make sure the code is on the branch Vercel deploys to production (normally `main`). If it's still on a feature branch, merge it first, or pick that branch under **Settings → Git → Production Branch**.
2. In Vercel: **Add New → Project**, import the repo. Framework preset: Next.js. No build settings to change.
3. **Settings → Environment Variables**: add `ANTHROPIC_API_KEY` (and optionally the others above).
4. Deploy.

Or from the CLI: `npx vercel`, then `npx vercel env add ANTHROPIC_API_KEY`, then `npx vercel --prod`.

`next.config.mjs` bundles `/knowledge` into the serverless functions (`outputFileTracingIncludes`), so the knowledge base ships with each deploy – add documents by committing them. API routes allow up to 60 s (`maxDuration`). Chat turns run at low effort by default to keep the conversation responsive.

## Project structure

```
app/
  page.tsx                  workspace: state, demo player, summary trigger
  components/Chat.tsx       chat, citations, upload area
  components/CaseFilePanel.tsx   live case file
  components/Modals.tsx     summary/email modal, knowledge-base browser
  api/chat/route.ts         intake turn
  api/summary/route.ts      adviser summary + client email
  api/knowledge/route.ts    list documents / test retrieval
lib/
  knowledge.ts              ingestion (.md/.txt/.pdf), chunking, BM25
  prompts.ts                system prompts and JSON schemas
  llm.ts                    Claude calls, citation mapping
  summary.ts                CLIENT CASE document assembly
  offline.ts                offline demo mode
  demoScript.ts             seeded demo conversation
knowledge/                  the knowledge base
```

## Not in scope (on purpose)

No authentication, billing, CRM or DATEV integration, database, phone/WhatsApp channels, or admin dashboard. See **Case Study Scope** above.
