# Entry engine — run contract

Everything you need to run `src/` and interpret its output **without reading the code**. If reality diverges from this doc, treat it as a failed run and escalate — do not open the source to reverse-engineer it.

## What it does (one paragraph)

Given a list of already-extracted invoice records, the engine logs into JobBOSS², and for each invoice: types the invoice number + PO number, triggers the receiver lookup, compares the invoice total to the receiver's expected amount, and routes to one of four outcomes — **clean match** (enter, Send-to-QuickBooks left ON), **date-only difference** (enter; the date field is mechanically overwritten with the invoice date — not an exception), **amount mismatch** (enter with Send-to-QuickBooks OFF and flag for review), or **no receiver yet** (enter nothing; hold as not-yet-received and recheck next run). It dedups against the ledger before touching anything, appends its decision to the ledger, and writes a report. In `dry_run` it does the full match and routing but **saves nothing and writes no ledger line**.

## How to run it

```bash
AP_TARGET=real node src/index.js --input <path-to-extracted-invoices.json>
```

- `AP_TARGET=mock` runs against the local mock server (`npm run serve:mock` first) — use for the demo.
- `AP_TARGET=real` runs against the configured JobBOSS² (ap-setup filled the selectors).
- Input JSON: an array (or `{invoices:[…]}`) of records `{ invoiceNo, poNo, amount, invoiceDate, vendor, source_message_id? }`. `invoiceNo`, `poNo`, `amount` are required.
- Run policy (`dry_run`, tolerance) comes from `<workDir>/settings.json`. To force dry-run for a one-off: prefix `AP_DRY_RUN=true`.

You do **not** pass credentials on the command line. The engine uses the configured session/Keychain (ap-setup).

## Expected output

**stdout**: a one-line summary, a table of every invoice with its status, and the two report paths. Example:

```
--- 2 entered · 1 exceptions · 1 not-yet-received · 0 issues ---
📄 report: <workDir>/reports/report-<timestamp>.md
            <workDir>/reports/report-<timestamp>.json
```

**Files**: `report-<timestamp>.json` (machine) and `.md` (human) under `<workDir>/reports/`. Read the **JSON** to assemble the weekly report; its shape:

```json
{
  "generatedAt": "…", "target": "real", "dryRun": false, "toleranceCents": 0,
  "summary": { "entered": 2, "exceptions": 1, "notYetReceived": 1,
               "filed": 0, "unclassified": 0, "issues": 0, "newVendors": 0, "stillWaiting": 3 },
  "entered": [ { "invoiceNo","poNo","vendor","invoiceCents","expectedCents","deltaCents","dateMismatch","reason","saved" } ],
  "exceptions": [ … same shape; deltaCents != 0; saved with Send-to-QB OFF … ],
  "notYetReceived": [ { "invoiceNo","poNo","vendor","first_seen" } ],
  "stillWaiting": [ { "invoiceNo","poNo","vendor","ageDays" } ],
  "newVendors": [ { "vendor","invoiceNo" } ],
  "issues": [ { "invoiceNo","poNo","reason" } ],
  "learnedNotes": []
}
```

Money is **integer cents** everywhere (`invoiceCents`, `expectedCents`, `deltaCents`). Divide by 100 for display, or use the `.md` which is already formatted.

### Per-invoice statuses (in the stdout table)

| Status | Meaning | Saved to Job Boss? |
|---|---|---|
| `ENTERED` / `WOULD_ENTER` | clean match (or date-only, `dateMismatch:true`) | yes / (dry-run: no) |
| `EXCEPTION_QB_OFF` | amount mismatch; entered with Send-to-QuickBooks unchecked, flagged | yes, QB off / (dry-run: no) |
| `NOT_YET_RECEIVED` | no receiver in Job Boss yet; held | no |

Items already handled in a prior run are **silently skipped** (dedup) and do not appear.

### Exit codes

- `0` — everything clean; nothing needs a human.
- `2` — at least one **exception** or **issue** — a human must look. (This is normal, not a crash.)
- `1` — **fatal**: the run itself failed (login, navigation, config). Nothing was saved past the failure point. Treat as a failed run.

## Failure modes — what unexpected output means and what to do

| Symptom | Likely cause | What to do |
|---|---|---|
| Exit `1`, "Login did not reach an authenticated page" | Session expired, or MFA/SSO login | Re-establish the Job Boss session (ap-setup reference 02, storageState). Do not retry blindly. |
| Exit `1`, "Selector slot is null" / element-not-found / timeout | Config drift — Job Boss UI changed, or a selector was never captured | **Escalate. Do not guess selectors.** Flag to Sylvan; a codegen re-capture is needed. |
| Everything routes `NOT_YET_RECEIVED` unexpectedly | The no-receiver marker is mis-detecting, or the lookup didn't fire | Stop; the receiver readback needs re-checking on the live screen. Do not enter anything. |
| An amount looks wrong in the report | Extraction read the wrong figure (subtotal vs total) | It's in the report as an exception/issue anyway — leave it for Ian; note the vendor quirk. |
| Empty or missing report file | The run died before writing | Treat as a failed run; nothing was saved. Re-run after fixing the cause. |

**Golden rule on any surprise: nothing was silently paid.** The engine never saves on mismatch, low confidence, or error — the worst case is an invoice that lands in the report for Ian to key in two minutes. When in doubt, escalate rather than work around.
