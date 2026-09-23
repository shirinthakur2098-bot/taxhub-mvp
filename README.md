# TaxHub

AI-native client intake for German tax advisory firms. A client describes their situation in plain language; TaxHub works out what kind of case it is, asks only for what's missing, requests the right documents, and builds a structured, adviser-ready case file as the conversation goes. Every factual statement cites the knowledge base.

TaxHub sits **before and around DATEV**. It does not replace DATEV and it does not give tax advice: it turns messy client communication into clean work for a human adviser.


## Quick start

```bash
npm install
cp .env.example .env.local      # add your ANTHROPIC_API_KEY (optional, see below)
npm run dev                     # http://localhost:3000
```

Click **▶ Play demo** to run the seeded new-GmbH scenario, then **Generate adviser summary & client email**.

Production build: `npm run build && npm start`. Type check: `npm run typecheck`.

## Environment variables

| Variable | Required | Default | What it does |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | For live AI | – | Claude API key from https://console.anthropic.com. Without it the app runs in **offline demo mode**. |
| `ANTHROPIC_MODEL` | No | `claude-opus-5` | Model used for intake and summaries. |
| `TAXHUB_EFFORT` | No | `medium` | `low` / `medium` / `high`. `low` answers faster; `high` extracts more carefully. |
| `TAXHUB_DISABLE_FALLBACKS` | No | `false` | TaxHub sends `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): if the model declines a request, the API retries it on Anthropic's recommended fallback model. Set to `true` to turn that off. |

That's all. No database, no auth, no other services.

### Live mode vs. offline demo mode

The header shows which mode is active.

- **Live AI** (`ANTHROPIC_API_KEY` set): every turn retrieves passages from `/knowledge`, sends them with the current case file to Claude, and gets back the reply, cited references and the updated case file as schema-validated JSON.
- **Offline demo mode** (no key): only the seeded scenario works. Replies and case-file snapshots are scripted, but **citations are not** – each one is produced by a real search over `/knowledge` at request time. Anything off-script gets an honest "no AI running" reply plus the raw retrieval hits. This mode exists so the demo still works on a laptop with no network or before you've added a key; it's labelled everywhere it appears.

## How it works

```
Client message ──► /api/chat
                     │ 1. BM25 search over /knowledge
                     │    (top 5 public passages + top 3 firm passages, labelled S1..S8)
                     │ 2. Claude: system prompt (guardrails) + history
                     │    + current case file + uploads + passages
                     │ 3. Structured output: { reply, grounding, citedRefs, escalate, caseFile }
                     │ 4. Server drops any [S#] the model cites that it wasn't given
                     ▼
UI: chat bubble with citation chips · case file diff-highlighted · sources list

"Generate summary" ──► /api/summary
                     │ retrieval on the case profile → Claude writes briefing,
                     │ next actions and client email → server assembles the
                     ▼ CLIENT CASE document from the structured case file
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

Drop in `.md`, `.txt` or `.pdf` files and restart. Folder decides public vs. firm; frontmatter (or a `.meta.json` sidecar for PDFs) sets title, URL, `synthetic: true`, and `status: starter-note`. Full details and a checklist of which real documents to add: **[knowledge/README.md](knowledge/README.md)**.

**Important:** the public files shipped here are **starter notes** – short paraphrases written for this demo, each linking to the official source. The build environment couldn't reach gesetze-im-internet.de or elster.de, so nothing was copied from the originals. They're badged "Starter note · verify" in the UI and the model is told to treat them carefully. Replace them with the real documents before showing this to anyone who'll rely on it.

Check what's indexed and test retrieval in the app (**📚 Knowledge base**) or at `GET /api/knowledge` and `GET /api/knowledge?q=Betriebsnummer`.

## Source labelling in the UI

| Badge | Meaning |
|---|---|
| **Official / public** (blue) | Statutes, authority guidance, vendor docs – from `knowledge/public/` |
| **Internal firm** (purple) | The firm's own workflow – from `knowledge/firm/` |
| **Synthetic demo** (amber) | Fictional content (the Muster & Partner SOP, the firm name in the header) |
| **Starter note · verify** (outline) | Paraphrase awaiting replacement with the official text |

Each assistant message also carries a grounding badge: *Grounded in cited sources*, *Firm workflow · no tax facts*, or *Not covered by knowledge base*, plus *Flagged for human adviser* when an escalation rule fires.

## Guardrails

Enforced in the system prompt (`lib/prompts.ts`) and in code:

- Factual statements must cite a supplied passage; unknown references are stripped server-side.
- If the knowledge base doesn't cover a question, TaxHub says so and adds it to the open questions instead of guessing.
- Law/official guidance and firm workflow are worded and badged differently.
- Escalation triggers (tax optimisation, binding statements, cross-border, missed deadlines, managing-shareholder social-security status, and anything in the firm SOP) are flagged for a human, not answered.
- The draft email is a draft. TaxHub never contacts clients.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, import the repo. Framework preset: Next.js. No build settings to change.
3. **Settings → Environment Variables**: add `ANTHROPIC_API_KEY` (and optionally the others above).
4. Deploy.

Or from the CLI: `npx vercel`, then `npx vercel env add ANTHROPIC_API_KEY`, then `npx vercel --prod`.

`next.config.mjs` bundles `/knowledge` into the serverless functions (`outputFileTracingIncludes`), so the knowledge base ships with each deploy – add documents by committing them. API routes allow up to 60 s (`maxDuration`). Live latency wasn't measured during development (no API key in the build environment); if turns feel slow, set `TAXHUB_EFFORT=low`.

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

No authentication, billing, CRM or DATEV integration, persistence, phone AI, or admin dashboard. Conversations live in the browser tab and disappear on reload.
