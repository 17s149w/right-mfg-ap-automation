# Self-learning — new vendors, extraction notes, and what must NEVER be learned

The system gets smarter by **accumulating structured knowledge on disk** (`vendors.json`), not by rewriting its scripts. `src/` stays frozen. Three tiers, three different rules:

## 1. New vendors — human-confirmed

When an invoice arrives from a vendor **not** in `vendors.json`:

- **Still run the match and enter it** per the normal rules (a new vendor is not a reason to skip — flag ≠ skip).
- **Always flag it** in the report's "New vendors — confirm handling" section.
- **Propose** adding it to `vendors.json`, but **append only after Ian confirms** its handling (`standard` / `file_only` / `statement_only`), folder, and any `match_names` aliases.

To add one, append to `vendors.json` `vendors[]`:

```json
{ "match_names": ["New Vendor Inc", "NVI"], "folder": "Suppliers/New Vendor Inc",
  "handling": "standard", "why": "Confirmed with Ian YYYY-MM-DD." }
```

The list grows **deliberately, never silently.**

## 2. Extraction quirks — auto-learn (low risk)

When you discover a repeatable way a vendor's document gets **read** wrong — invoice # and PO # swapped in the header, `total_amount` grabbing the subtotal, a spaced `P.O 1234`, "scanned, always needs OCR" — you **may** append a note yourself to `vendors.json` `extraction_notes`, keyed by vendor, and **log it in the report** ("learned: …").

Why this is safe to auto-append: a bad note only ever causes a *flag* that Ian already reviews. It influences **extraction only** — never the PO-match / entry decision. The next run's extraction step consults these notes to avoid repeating the mistake.

```json
"extraction_notes": {
  "Iron Bear Freight": "Invoice number prints as 'INV / 4504' — take the digits after the slash."
}
```

## 3. Tolerances — NEVER learned

Price/amount tolerance is **preset by a human only** (`settings.json` → `price_tolerance_dollars`, currently exact match). The learning loop is **forbidden** from touching it. Do not infer, widen, or per-vendor-adjust a tolerance from observed matches — a supplier who pads every invoice by a few dollars would train the system to accept the padding. If a tolerance seems wrong, that's a conversation with Ian, not an auto-edit.

## The invariant

Learning only ever changes **how documents are read** and **which vendors are known**. The deterministic PO-match and entry path never changes at runtime. Every lesson is a diff in `vendors.json` you can read — auditable by design.
