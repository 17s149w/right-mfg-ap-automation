# QuickBooks — read-only statement aged-item check (Procedure C)

> **[PHASE 2 — off in v1.]** v1 does not do the automated QuickBooks check. Scanned statements are filed to `Statements/` for Ian's monthly manual review. This reference describes the check for when it's turned on. **Runtime note:** the check needs a QuickBooks connector/MCP that works **inside Claude Code** (the runtime that also runs the Job Boss automation) — do NOT assume the Cowork connector, which lives in a separate environment that can't run the local automation. Confirm an available QB integration before building on this.

**QuickBooks gets ZERO writes.** This is a read-only lookup. QuickBooks is the *payment* record — Job Boss knows what was ordered/received, not what was paid, so the "already paid?" question is answered here.

## Which statements

- **Scanned statements** → just file to `Statements/`. Ian reviews that folder manually once a month. Do **not** automate these (no machine-readable aging).
- **Emailed statements** → run the aged-item check below (this is the one Ian asked to automate).

## The check (emailed statements)

1. Read the aging columns. Identify every row **not in Current** (i.e. 1–30 / 31–60 / 61–90 / Over 90).
2. If **every** row is Current → **no action, keep no file.** One report line noting the statement was clean.
3. For each aged row capture: **vendor, invoice number, invoice date, amount.**
   - Statements often show only the **last 4 digits** of the invoice number (Ian worked with `9997`, `0446`). **Match on last-4 + vendor + amount + date** — not a full invoice number.
4. Look it up in **QuickBooks** (Cowork connector, read-only): Vendor → find the invoice by number and/or date → read **payment status + payment date**.
   - Live example: Hogan Rubber invoice `9997`, dated 7/6, shows aged → QuickBooks shows due 8/6, **paid 8/4** → non-issue.
5. Outcome per aged row:
   - **Paid** → non-issue. Do **not** save the statement. **Report it anyway** with invoice #, due date, date paid — this shows the check ran (silence looks like a skipped step).
   - **Unpaid or not found** → **escalate.** Save the statement PDF to `Statements/` and list it in the report's escalation section for Ian to resolve.

**Check every aged row.** Ian spot-checks two of four and assumes the rest because the lookup is tedious by hand — it's free for you.

## Vendor-name matching

Statement vendor names won't always match QuickBooks exactly (the "Hogan Rubber" / "Hose & Rubber" problem). Use the alias map in `vendors.json` (`match_names`) to bridge. If you can't resolve a vendor confidently, treat the row as **not found → escalate**, don't guess.

## If the connector isn't available

If the Cowork QuickBooks connector isn't authorized/reachable this run, do **not** fail the whole run. Skip the statement check, and list the aged rows you found in the report's escalation section marked "QuickBooks unavailable — verify manually," so Ian still sees them.
