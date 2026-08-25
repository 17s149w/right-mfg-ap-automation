# Extraction — document → §7 JSON

Read a **small, fixed set of figures by label** off each document. **Never parse the line-item table** — it's the most failure-prone, most expensive thing on a scanned invoice, and routing only needs the total.

## The §7 contract (what to emit per document)

```json
{
  "supplier_name": "string",
  "invoice_number": "string",
  "po_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "subtotal": 0.00,
  "tax": 0.00,
  "extra_charges": [{ "description": "Delivery", "amount": 60.00 }],
  "total_amount": 0.00,
  "page_range_in_batch": [4, 5],
  "source": "scan|email|not_yet_received_recheck",
  "confidence": { "invoice_number": 0.0, "po_number": 0.0, "total_amount": 0.0 }
}
```

- **`total_amount` = the bottom-of-document total, never a line.** An invoice has many figures that look like totals; only the bottom line is comparable to the PO.
- **`extra_charges` = a targeted label scan**, not table parsing. Look anywhere for these labels and read the adjacent amount: `freight · delivery · shipping · handling · fuel surcharge · fuel · postage · crating · packaging · expedite · rush · minimum order · small order fee`. Capture `{description, amount}` using the label as printed. This turns "off by $60" into "off by $60, delivery charge not on the PO" — the difference between Ian re-reading and Ian just deciding.
- **Low confidence on ANY required field (`invoice_number`, `po_number`, `total_amount`) → route to "Issue reading PDF" in the report. Never guess.** A wrong PO silently attaches an invoice to the wrong order; a skipped doc costs Ian two minutes. The failure modes are not symmetric.

## Two paths

- **Born-digital emailed PDFs** (real text layer): the deterministic path. Run `node extract/extract.js <file.pdf>` (EXTRACT_MODE=textLayer, the default). Free, no AI. It emits the §7 object with `_needsHuman`/`_issues` set when confidence is below the floor.
- **Scanned batch pages** (image-only): OCR the whole batch up front (~1 min/doc; text isn't selectable until it finishes), then extract with a **Sonnet sub-agent per segmented document**. Give the sub-agent the §7 schema and this instruction:

  > Read ONLY these labeled figures — supplier name, invoice number, PO number, invoice date, and the BOTTOM total. Do a targeted label scan for extra charges (freight/delivery/…). Do NOT parse the line-item table. Return a confidence 0–1 for each of invoice_number, po_number, total_amount. If you cannot read a required field with confidence, say so — do not guess.

  Sonnet is the cheap tier and is plenty for ~15 pages/week; using a sub-agent keeps this off the main context budget.

## Then

- Map each clean §7 record to the engine's input shape `{ invoiceNo, poNo, amount, invoiceDate, vendor, source_message_id }` (the `engineRecord()` helper in `extract/extract.js` does exactly this) and collect them into the input JSON for the entry engine.
- Collect every `_needsHuman` document into the report's **"Issue reading"** list — do not send them to the engine.
- If you discover a repeatable read quirk for a vendor (swapped invoice/PO, amount grabbing the subtotal, a spaced `P.O 1234`), note it — see `add-vendor.md`.
