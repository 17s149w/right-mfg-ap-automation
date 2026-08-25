# AP weekly run — {{DATE}}{{DRY_RUN_BANNER}}

_Target: `{{TARGET}}` · tolerance: {{TOLERANCE}} · run by ap-weekly-run_

## Summary

| Outcome | Count |
|---|---|
| Entered (clean match) | {{N_ENTERED}} |
| Exceptions (Send-to-QB OFF, review) | {{N_EXCEPTIONS}} |
| Not yet received | {{N_NYR}} |
| Filed (auto-pay / file-only) | {{N_FILED}} |
| Statements checked | {{N_STATEMENTS}} |
| Issue reading (needs human) | {{N_ISSUES}} |
| New vendors to confirm | {{N_NEW_VENDORS}} |

---

## ✅ Entered — clean match ({{N_ENTERED}})
_Amount matched the receiver. Send-to-QuickBooks left ON. Date-only differences were corrected mechanically and are noted, not flagged._

- **{{invoiceNo}}** · PO {{poNo}} · {{vendor}} · {{amount}} {{· _date overwritten_ if applicable}}

## ⚠️ Exceptions — entered with Send-to-QuickBooks OFF, need review ({{N_EXCEPTIONS}})
_Amount did not match. Entered into Job Boss but held out of QuickBooks and flagged. Ian decides._

- **{{invoiceNo}}** · PO {{poNo}} · {{vendor}} · invoice {{amount}} vs receiver {{expected}} ({{±delta}}) · {{suspected_cause, e.g. "delivery charge $60 not on the PO"}}

## ⏳ Not yet received ({{N_NYR}})
_PO exists but no receiver in Job Boss yet. Nothing entered; will recheck next run._

- **{{invoiceNo}}** · PO {{poNo}} · {{vendor}} · {{amount}}

### Still waiting from earlier runs ({{N_STILL_WAITING}})
_Confirm these are expected; investigate anything old. Items over {{FLAG_DAYS}} days are marked ⚑._

- **{{invoiceNo}}** · PO {{poNo}} · {{vendor}} · {{ageDays}}d old {{⚑ if aged}}

## 🗂️ Filed — auto-pay / file-only ({{N_FILED}})
_On auto-pay; filed for the record, no Job Boss/QuickBooks entry._

- **{{vendor}}** · filed to {{folder}}

## 🧾 Statements — QuickBooks aged-item check ({{N_STATEMENTS}})
_Read-only. "Paid" aged rows are reported to show the check ran. Unpaid/not-found are escalated and the statement is kept._

- **{{vendor}}** statement — aged row {{invoice_last4}} ({{amount}}, due {{due}}) → **{{PAID date / UNPAID — escalated / NOT FOUND — escalated}}**

## 🔧 Issue reading — a human should key these ({{N_ISSUES}})
_Extraction confidence too low on a required field. Not entered. Never guessed._

- **{{invoiceNo or (unread)}}** · {{source}} · {{reason}}

## 🆕 New vendors — confirm handling ({{N_NEW_VENDORS}})
_Matched and entered per the rules, but not yet in `vendors.json`. Confirm handling so they file/tolerance correctly next time._

- **{{vendor}}** (first seen on {{invoiceNo}})

## 🧠 Learned this run
_Extraction-quirk notes auto-appended to `vendors.json`. Tolerances are never learned._

- **{{vendor}}**: {{note}}

---
_Report saved to `{{REPORT_PATH}}`. Reply with any corrections and I'll fix the ledger before next run._
