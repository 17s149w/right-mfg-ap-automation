# 07 — Verify, validate extraction, and set go-live

Goal: prove the whole path end-to-end on real data, in dry-run, and agree with Ian on when it goes live. Nothing here writes to Job Boss or QuickBooks.

## 1. Mock demo (proves the engine independent of Job Boss)

```bash
npm run serve:mock &            # start the mock
AP_TARGET=mock node src/index.js --input data/invoices.sample.json
```

Expect: 2 entered (one with "date overwritten"), 1 exception (Send-to-QB OFF, +$60), 1 not-yet-received, and a report written under `<workDir>/reports/`. This is the client-showable demo of the four outcomes.

## 2. Extraction validation on REAL invoices (can only be done here)

Grab **last week's real scan batch** and a handful of **emailed invoices** as fixtures. For each:

```bash
node extract/extract.js "<real-invoice.pdf>"
```

Check against the actual PDF:
- Did `total_amount` come from the **bottom total**, not a line or subtotal?
- Are `invoice_number` and `po_number` right (watch for swapped fields, spaced `P.O`, OCR digit errors)?
- Did `extra_charges` catch any freight/delivery line?
- On anything unclear, did it set `_needsHuman` (route to "Issue reading") instead of guessing? **That's the behavior you want** — confirm low-confidence docs flag rather than fabricate.

Record any repeatable vendor quirk into `<workDir>/vendors.json` `extraction_notes` (see the operational skill's `add-vendor.md`). This is also where you decide, per Ian's vendor mix, whether the born-digital text-layer path is enough or scanned docs should route through the Sonnet sub-agent path.

⚠️ **Fixtures contain banking info.** Keep them out of any synced/shared folder while testing, and **delete them at the end of this session.**

## 3. Dry-run on real data, end-to-end

Feed the extracted real invoices to the engine against the real Job Boss, still in dry-run:

```bash
AP_TARGET=real AP_DRY_RUN=true AP_HEADLESS=false node src/index.js --input <extracted-real-invoices.json>
```

Watch it read receiver amounts back and route the four outcomes correctly. Review the report **with Ian** — does each routing decision match what he'd have done by hand?

## 4. Report delivery

Confirm with Ian how he wants the weekly report (Q10/#13): saved file only, emailed, or both, and anyone to cc. Set `report_email_to` / `exception_email_to` in `settings.json`. (Sending email is confirm-first at run time regardless.)

## 5. Go-live decision (do NOT flip today unless Sylvan + Ian both say so)

Leave `dry_run: true`. Going live means, after **N clean attended dry-runs** where every routing decision matched Ian's judgment, flipping:

```json
{ "dry_run": false }
```

That's a deliberate, separate decision — not part of install. Write the agreed plan (how many clean runs, who flips it) into `<workDir>/SETUP-STATUS.md`.

## 6. Close-out

- `<workDir>/SETUP-STATUS.md`: what's done, what's pending (e.g. QuickBooks if deferred), the go-live plan.
- **Delete the test fixtures** (banking info).
- Confirm `dry_run: true`, `seed_mode: false`, ledger warm.

## Gate

- Mock demo produces the four outcomes + a report.
- Real extraction validated on real invoices; low-confidence docs flag, don't guess.
- A real-Job-Boss **dry-run** reads back correctly and Ian agrees with the routing.
- Go-live criteria written down. Nothing is live yet.
