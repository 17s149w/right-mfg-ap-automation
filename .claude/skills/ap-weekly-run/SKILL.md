---
name: ap-weekly-run
description: Run the weekly AP invoice pass for Right Mfg — gather invoices from the scan folder and AP mailbox, extract the key figures, check statements against QuickBooks, enter clean two-way PO matches into JobBOSS² via the frozen entry engine, and produce the weekly report. Use this every Friday (or when asked to "run AP", "process invoices", "do the weekly AP run"). Requires that ap-setup has already been run on this machine.
---

# AP weekly run

You are running Right Mfg's weekly accounts-payable pass. Ian normally does this by hand every Friday. Your job is to do the mechanical 90% safely and hand Ian a short report of the judgment 10%.

## The one rule that matters most

**You RUN the entry engine — you never read its source.** The deterministic money path lives in `src/` (a frozen Playwright engine). You invoke it as a command and consume its JSON/exit-code output. Do **not** open `src/*.js` into context, and never hand-click Job Boss yourself. Reading the code wastes context and tempts "improvements" to the one path that must not drift. Everything you need to run and interpret it is in `references/script-contract.md`.

## Preflight (do this first, every run)

1. Confirm setup has run: the working dir must be configured (env `AP_WORK_DIR` or `src/runtime-path.json`) and contain `settings.json` + `vendors.json`. If not → **stop** and tell the user to run the `ap-setup` skill. Do not proceed.
2. Read `settings.json`. Announce the two settings that change what happens: **`dry_run`** and **`seed_mode`**. If either is true, say so plainly up front — in those modes nothing is written.
3. Back up the master scan PDF before any extraction (extraction consumes pages). Copy `New Scans/*.pdf` to `<workDir>/pdf-backups/` first.

## Run order (spec procedures E → A/B → C → D)

Run **Procedure E first**, then gather, then enter.

1. **E — Recheck not-yet-received.** For every open `not_yet_received` item in the ledger, re-run the match (its PDF is still in `Shipment Not Yet Received/`). If a receiver now exists it routes to entry; if not it stays waiting and ages. This runs first so newly-arrived goods get entered before this week's fresh batch.
2. **Gather.**
   - **A — Scanned batch** (`New Scans/`, ~15 pages, one master PDF): OCR the whole batch up front, segment into documents (boundary signals: vendor change, invoice-number change, `Page 1 of N`), classify each (file_only vendor → file; statement → Procedure C; else invoice).
   - **B — AP mailbox** (Gmail): list a **rolling 45-day window** (read AND unread — never scope by unread), then dedup against the ledger by `source_message_id` **before** downloading anything.
3. **Extract** each invoice document to the §7 contract. See `references/extraction.md`. Born-digital emailed PDFs use the deterministic text-layer path; scanned pages use a **Sonnet sub-agent** per document. **Low confidence on any required field → "Issue reading PDF" in the report. Never guess.**
4. **C — Statements → QuickBooks.** For each emailed statement, check its aged rows against QuickBooks (read-only) via the **Cowork QuickBooks connector**. See `references/quickbooks.md`. Clean → note; still-open/aged → escalate in the report. **Zero writes to QuickBooks, ever.**
5. **D — Enter invoices.** Hand the extracted invoice records to the entry engine (one command). The engine does the two-way PO match and the four-outcome routing. See `references/script-contract.md`.

## After the run

1. **Assemble the report** from the engine's JSON output using `assets/report-template.md`. Add the statement/QB results and the extraction issues you collected.
2. **Deliver** it per `settings.json` (`report_email_to`) — and always save it to `<workDir>/reports/`. Ask before sending any email (sending is a confirm-first action).
3. **Apply learning** (see `references/add-vendor.md`):
   - **New vendors** the run flagged → propose adding them to `vendors.json`; append only after Ian confirms.
   - **Extraction quirks** you discovered → you may append a note to `vendors.json` `extraction_notes` and log it in the report ("learned: …").
   - **Never** change tolerances — those are preset by a human only.

## Safety rails (non-negotiable)

- **dry_run** and **seed_mode** short-circuit all writes. The engine enforces dry_run structurally; you must not work around it.
- Nothing saves on a mismatch or a low-confidence read — it goes to the report for Ian.
- QuickBooks is read-only.
- Secrets (Job Boss session, mail auth) live in Keychain / an env file OUTSIDE the synced folders — never echo them into the report or the conversation.

## References (load only when you need them)

- `references/script-contract.md` — how to run the engine, its exact output, statuses, and failure modes. **Read this before running the engine.**
- `references/extraction.md` — the §7 extraction contract, the Sonnet sub-agent path, the extra_charges scan, the never-guess rule.
- `references/quickbooks.md` — the read-only statement aged-item check via the Cowork connector.
- `references/add-vendor.md` — the self-learning loop: new vendors, extraction notes, and what must never be learned.
- `assets/report-template.md` — the report skeleton to fill in.
