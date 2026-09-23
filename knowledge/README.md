# TaxHub knowledge base

Every `.md`, `.txt` and `.pdf` file in this folder is chunked and indexed automatically when the server starts. There is no build step: add a file, restart `npm run dev` (or redeploy), done.

## Folder = source type

| Folder | Shown in the UI as | Use for |
|--------|--------------------|---------|
| `public/` | **Official / public** (blue) | Statutes, ELSTER guidance, BMF letters, DATEV public docs |
| `firm/` | **Internal firm** (purple) | Your SOPs, checklists, templates |

Anything with `synthetic: true` in its frontmatter gets an extra **Synthetic demo** badge (amber), regardless of folder. Anything with `status: starter-note` gets a **Starter note – verify** badge.

## Metadata

Markdown/text files can start with YAML-style frontmatter:

```
---
title: ELSTER – Fragebogen zur steuerlichen Erfassung (GmbH)
source_type: public        # public | firm (optional; folder is used otherwise)
synthetic: false
status: official           # official | starter-note
publisher: ELSTER
url: https://www.elster.de/...
---
```

PDFs can't carry frontmatter, so add a sidecar file with the same name plus `.meta.json`, e.g. `elster/fse-kapges.pdf.meta.json`:

```json
{ "title": "ELSTER – Fragebogen Kapitalgesellschaft (Ausfüllhilfe)", "publisher": "ELSTER", "url": "https://www.elster.de/...", "status": "official" }
```

Without metadata the file name is used as the title.

## What's in here now

The files under `public/` are **starter notes**: short paraphrases written for the demo, each linking to the official source. The build environment couldn't reach gesetze-im-internet.de or elster.de, so they were not copied from the originals. Replace them with the real documents as soon as you can.

`firm/muster-partner-new-gmbh-intake-sop.md` is a **synthetic** SOP for a fictional firm.

## Where to put the real documents

| Put this... | ...here |
|-------------|---------|
| ELSTER help pages for "Unternehmensgründung" (save as PDF or copy into .md) | `public/elster/` |
| ELSTER "Fragebogen zur steuerlichen Erfassung – Kapitalgesellschaft" (PDF print / Ausfüllanleitung) | `public/elster/` |
| AO §§ 137, 138 full text from gesetze-im-internet.de | `public/tax-law/` (replace the starter note) |
| EStG § 41a, SGB IV §§ 18i, 28a, HGB § 238, GmbHG §§ 13, 41, GewO § 14 | `public/tax-law/` |
| UStG § 18 (Umsatzsteuer-Voranmeldung) and relevant BMF letters | `public/tax-law/` |
| DATEV help-center articles (Unternehmen online, Lohn und Gehalt, DATEV-Format import) | `public/datev/` |
| Your real firm SOPs | `firm/` |

When you replace a starter note, delete it (or set `status: official` if you've verified and rewritten it) so stale paraphrases don't compete with the originals in retrieval.

Check what got indexed at `/api/knowledge` or in the app's **Knowledge base** tab.
