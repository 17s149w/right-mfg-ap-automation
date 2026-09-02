# CONTINUE HERE — current state & staged plan

> **This file is the source of truth for where the build is.** Where anything in
> `BUILD-PLAN.md`, `ONSITE-SESSION-PREP.md`, or `PLAN.md` conflicts with this
> (they predate the Cowork→Claude Code correction and the scope cut), **this file
> wins.** Read this first, then the two skills.

## The correction that reshaped the plan

- **Runtime is Claude Code**, on the **Windows PC** that has Job Boss access + the
  OneDrive files. Cowork was ruled out — it runs in a sandboxed VM that cannot drive
  the local browser (Playwright → Job Boss) or read local OneDrive files. Anything
  older that says "Cowork" or "Ian's Mac" is stale.
- **v1 scope = the scanned-batch folder only** (spec Procedure A → D). **Deferred to
  Phase 2:** Gmail email intake (Procedure B) and the QuickBooks statement check
  (Procedure C). When email is added it uses the **Gmail connector** (which does work
  in Claude Code), not IMAP. QuickBooks waits until a QB integration usable *inside
  Claude Code* is confirmed.

## What's already done (on the Windows PC)

- Node + `npm install` done; Playwright works.
- `playwright codegen` run against live Job Boss; selectors captured into
  `src/config.js` `real` profile — **except the vendor-display readback (`vendorField`)**,
  still TODO. That field is an *optional* readback: if no stable locator, set it null
  and the engine uses the vendor name from extraction. Non-blocking.

## How to work: staged validation with a human gate

Do **one stage at a time**. After each: **STOP**, show exactly what you did and the raw
output, and **wait for the human to confirm** before starting the next stage. Each
stage is a mini-eval with a sign-off — never chain stages silently. If something looks
wrong, flag it and stop; don't work around it.

**Safety for every stage:** stay in `dry_run` (nothing saves to Job Boss); QuickBooks
untouched; secrets stay out of the repo and out of OneDrive.

### Which skill governs each stage

Both skills are in `.claude/skills/`. Read **both** up front (they're short):
- **`ap-setup`** is the *procedure* you're executing now (install/validate on the real
  machine). Its `references/` are the how-to for stages 1–3, 6, 7.
- **`ap-weekly-run`** holds the *operational contracts* your stages exercise
  (`references/extraction.md`, `references/script-contract.md`,
  `assets/report-template.md`). **Consult these — do NOT fire `/ap-weekly-run`
  end-to-end**, which would run every stage at once and defeat the per-stage gate.
- Do **not** read `src/*.js` into context. You RUN the engine per
  `ap-weekly-run/references/script-contract.md`.

## The stages

**Stage 1 — OneDrive discovery & folder plan.** *(ap-setup `references/01-environment.md`)*
Explore the OneDrive AP area on this machine. Report: where current invoices live, how
it's organized, and what exists vs. what's missing vs. the spec's folder map
(`AP-Workflow-Spec.md` §4: `New Scans/`, `Suppliers/`, `Statements/`, `Shipment Not Yet
Received/`, `_AP Automation/`). **Ask the human where things should live and where
outputs should go.** Propose folders to create — create them only after approval.
Confirm files materialize (not zero-byte cloud placeholders). Wire the working-dir path
(`src/runtime-path.json` → the `_AP Automation/` path). **STOP.**

**Stage 2 — Vendor list seeding from the folders.** *(ap-setup `references/05-vendors-aliases.md`)*
List the subfolders under `Suppliers/` and turn that into the initial vendor roster.
Show the full list. Reconcile names with the human and mark the `file_only` / auto-pay
vendors. Write it to `<workDir>/vendors.json` (spec §6.1 shape; a template is in
`config.example/vendors.json`). **STOP.**

**Stage 3 — Finish the vendor-display selector.** *(ap-setup `references/02-jobboss-capture.md`)*
Re-run codegen focused only on the vendor field that populates after a PO lookup; fill
`vendorField` in `src/config.js`. If no stable locator, set it null. Confirm with a
dry-run readback against real Job Boss. **STOP.**

**Stage 4 — PDF processing (extraction).** *(ap-weekly-run `references/extraction.md`)*
Take the real scan batch in `New Scans/`. **Back it up to `<workDir>/pdf-backups/`
first** (extraction consumes pages). OCR + segment into documents, then extract each to
the §7 JSON contract. Show each extracted record beside its source so the human can
verify invoice#, PO#, and that the total came from the **bottom** total — and that
anything low-confidence flagged as "Issue reading" instead of guessing. **STOP.**

**Stage 5 — Classification.** *(spec §8 A3; ap-weekly-run SKILL.md run-order)*
Categorize each document: `file_only` vendor → file to its `Suppliers/` folder;
statement → park to `Statements/` (no QB check in v1); invoice → entry queue. Show the
categorization + reasoning. **STOP.**

**Stage 6 — Job Boss entry, DRY RUN (headed).** *(ap-weekly-run `references/script-contract.md`)*
Feed the invoice queue to the entry engine against real Job Boss with `dry_run=true`,
headed so the human watches. Confirm it reads the receiver amount back and routes the
four outcomes correctly (clean / date-only / price-mismatch / no-receiver). Nothing
saves. Review the report it writes. **STOP.**

**Stage 7 — Full end-to-end dry run.** *(ap-setup `references/07-verify.md`)*
Only after 1–6 all pass: run the whole scan-folder pass end to end in `dry_run` and
review the final weekly report together. Going live (`dry_run: false`) is a separate,
later decision after clean attended runs — not part of this pass.

## Commits

When a stage changes `src/config.js` (captured selectors) and the human approves it:
`git add src/config.js && git commit && git push`. Note: `vendors.json`, the ledger,
and reports live in the OneDrive working dir — **outside the repo by design** — so they
are not committed.
