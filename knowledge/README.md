# TaxHub knowledge base

Every `.md`, `.txt` and `.pdf` file in this folder is chunked and indexed automatically when the server starts. There is no build step: add a file, restart `npm run dev` (or redeploy), done.

## Folder = source type

| Folder | Shown in the UI as | Use for |
|--------|--------------------|---------|
| `public/` | **Official / public** (blue) | Statutes, ELSTER guidance, BMF letters, DATEV public docs |
| `firm/` | **Internal firm** (purple) | Your SOPs, checklists, templates |

Anything with `synthetic: true` in its frontmatter also gets a **Synthetic demo** badge (amber), regardless of folder.

## Metadata

Markdown/text files start with YAML-style frontmatter:

```
---
title: ELSTER – Fragebogen zur steuerlichen Erfassung (Kapitalgesellschaft)
source_type: public        # public | firm (optional; the folder is used otherwise)
synthetic: false
status: verified-official-source
publisher: ELSTER / German tax administration
url: https://www.elster.de/...
accessed: 2026-09-23
---
```

`title`, `url` and the source type are what users see in citations. The file name is never shown in a citation.

PDFs can't carry frontmatter, so add a sidecar file with the same name plus `.meta.json`, e.g. `elster/fsekapg-help.pdf.meta.json`:

```json
{ "title": "ELSTER – Fragebogen Kapitalgesellschaft (Ausfüllhilfe)", "publisher": "ELSTER", "url": "https://www.elster.de/..." }
```

Without metadata the file name is used as the title.

## What's in here now

| File | Type | Source |
|------|------|--------|
| `public/tax-law/ao-137-138-anzeigepflichten.md` | Official / public | §§ 137, 138 AO + ELSTER guidance |
| `public/elster/elster-fragebogen-steuerliche-erfassung-gmbh.md` | Official / public | ELSTER help for the Kapitalgesellschaft questionnaire |
| `public/tax-law/estg-41a-lohnsteuer-anmeldung.md` | Official / public | § 41a EStG |
| `public/tax-law/sgb-iv-arbeitgebermeldungen.md` | Official / public | §§ 18i, 28a SGB IV |
| `public/tax-law/hgb-gmbhg-buchfuehrungspflicht.md` | Official / public | § 238 HGB, § 6 HGB, §§ 13, 41 GmbHG |
| `public/tax-law/gewo-14-gewerbeanmeldung.md` | Official / public | § 14 GewO |
| `public/datev/datev-public-workflow-overview.md` | Official / public | DATEV public product pages |
| `firm/muster-partner-new-gmbh-intake-sop.md` | Internal firm · **Synthetic demo** | Fictional firm SOP written for this case study |

Each public file is a source-grounded note that links to the official text. To extend coverage (e.g. UStG § 18 for VAT returns, BMF letters, DATEV help-center articles), add files the same way.

Check what got indexed, and test retrieval, in the app's **Knowledge base** panel or at `/api/knowledge` and `/api/knowledge?q=Betriebsnummer`.
