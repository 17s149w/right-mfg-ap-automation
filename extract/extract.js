// =============================================================================
// extract.js — the upstream "document -> §7 JSON" step. Two adapters behind one
// interface; both emit the SPEC §7 contract. This is the ONLY stage where paid
// AI is justified, and it stays isolated here so the Playwright entry half is $0.
//
//   document  ->  [text layer | OCR]  ->  adapter (textLayer | ai)  ->  §7 JSON
//                                                                       |
//                                          engineRecord() maps §7 -> {invoiceNo,
//                                          poNo, amount, invoiceDate, vendor}
//                                          which src/index.js consumes.
//
// KEY RULES (spec §7):
//   * Extract a small fixed set of figures by LABEL — never parse the line-item
//     table. Routing (D3) reads only the total.
//   * total_amount = the BOTTOM-of-document total, never a line.
//   * extra_charges = a TARGETED LABEL SCAN (freight/delivery/…), not a table.
//   * LOW CONFIDENCE ON ANY REQUIRED FIELD -> route to "Issue reading PDF".
//     Never guess. A skipped doc costs Ian 2 minutes; a wrong PO silently
//     attaches an invoice to the wrong order.
//
// ADAPTER CHOICE (spec + build decision):
//   * Born-digital emailed PDFs have a real text layer -> `textLayer` (free,
//     deterministic).
//   * Scanned batches need OCR + robust field-finding -> `ai`. In the Cowork
//     runtime this is realized by dispatching a SONNET sub-agent per document
//     (cheap tier is plenty for ~15 pages/week). See extractAI() for the seam.
// =============================================================================

import { readFileSync } from 'node:fs';

const MODE = process.env.EXTRACT_MODE || 'textLayer'; // 'textLayer' | 'ai'

// Required fields for the entry engine. Missing/low-confidence here => needsHuman.
export const REQUIRED = ['invoice_number', 'po_number', 'total_amount'];

// Confidence floor. Any REQUIRED field below this => "Issue reading PDF".
const CONFIDENCE_FLOOR = Number(process.env.EXTRACT_CONF_FLOOR ?? 0.75);

// extra_charges label scan (spec §7 — CONFIRM the list with Ian). Case-insensitive.
export const EXTRA_CHARGE_LABELS = [
  'freight', 'delivery', 'shipping', 'handling', 'fuel surcharge', 'fuel',
  'postage', 'crating', 'packaging', 'expedite', 'rush', 'minimum order',
  'small order fee',
];

// -----------------------------------------------------------------------------
// 0. Get text out of the document.
//    - Born-digital PDF: pdf-parse (free). - Scanned image: needs OCR first
//      (the `ai` adapter path). A `.txt` shortcut is supported for the demo.
// -----------------------------------------------------------------------------
async function pdfToText(path) {
  if (path.endsWith('.txt')) return readFileSync(path, 'utf8');
  const { default: pdfParse } = await import('pdf-parse').catch(() => {
    throw new Error("Text-layer extraction needs 'pdf-parse' (npm i pdf-parse), or pass a .txt for the demo.");
  });
  const { text } = await pdfParse(readFileSync(path));
  return text;
}

// =============================================================================
// ADAPTER A — TEXT LAYER (born-digital). Cost $0, deterministic. Label-anchored
// regex for the fixed field set; no table parsing.
// =============================================================================
const FIND = {
  supplier_name:  /^([A-Z][A-Za-z0-9 &,.'\-]{2,40})\s*$/m,
  invoice_number: /invoice\s*(?:#|no\.?|number)\s*[:\-]?\s*([A-Z0-9\-]+)/i,
  po_number:      /\bP\.?\s*O\.?\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9\-]+)/i,
  invoice_date:   /(?:invoice\s*date|date)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
  // total_amount: prefer an explicit bottom-total label; fall back to the LAST
  // money figure in the doc (bottom-of-document), never the first.
  total_labeled:  /(?:total\s*due|amount\s*due|balance\s*due|invoice\s*total|grand\s*total)\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i,
};

function grab(text, re) { const m = text.match(re); return m ? m[1].trim() : null; }
function toNum(s) { return s == null ? null : Number(String(s).replace(/[^0-9.\-]/g, '')); }

function scanExtraCharges(text) {
  // Line-based: find the line carrying a charge label and take the LAST money
  // figure on that line (avoids a greedy match capturing a partial like "0.00"
  // out of "60.00"). One entry per label found.
  const out = [];
  const lines = text.split('\n');
  for (const label of EXTRA_CHARGE_LABELS) {
    const labelRe = new RegExp(`\\b${label}\\b`, 'i');
    for (const line of lines) {
      if (!labelRe.test(line)) continue;
      const monies = [...line.matchAll(/\$?\s*([\d,]+\.\d{2})/g)];
      if (!monies.length) continue;
      const amount = toNum(monies[monies.length - 1][1]); // last figure on the line
      const m = line.match(labelRe);
      out.push({ description: m[0], amount });
      break; // first line matching this label is enough
    }
  }
  return out;
}

function extractTextLayer(text) {
  let total = toNum(grab(text, FIND.total_labeled));
  if (total == null) {
    const monies = [...text.matchAll(/\$?\s*([\d,]+\.\d{2})/g)].map((m) => toNum(m[1]));
    total = monies.length ? monies[monies.length - 1] : null; // bottom-of-document
  }
  const invoice_number = grab(text, FIND.invoice_number);
  const po_number = grab(text, FIND.po_number);
  // Deterministic regex gives no probability; encode "found = 0.9, missing = 0"
  // so the SAME confidence gate governs both adapters.
  const conf = (v) => (v == null || v === '' ? 0 : 0.9);
  return {
    supplier_name: grab(text, FIND.supplier_name),
    invoice_number, po_number,
    invoice_date: grab(text, FIND.invoice_date),
    subtotal: null, tax: null,
    extra_charges: scanExtraCharges(text),
    total_amount: total,
    page_range_in_batch: null,
    source: 'email',
    confidence: {
      invoice_number: conf(invoice_number),
      po_number: conf(po_number),
      total_amount: conf(total),
    },
    _via: 'textLayer',
  };
}

// =============================================================================
// ADAPTER B — AI (scanned batches). SHAPE + SEAM, not a live call. In the Cowork
// runtime the operational skill dispatches a Sonnet sub-agent per segmented
// document with this exact instruction and the §7 schema, and pastes the
// returned object here. The reference implementation below shows the SDK form.
// =============================================================================
async function extractAI(_pathOrText) {
  // Realized in the skill as a Sonnet sub-agent (cheap tier, ~15 pages/week):
  //
  //   model: 'claude-sonnet-5'  (or 'claude-haiku-4-5-20251001' for pure text)
  //   tool: emit_invoice(schema = §7 object above)
  //   prompt: "Read ONLY these labeled figures — supplier, invoice number, PO
  //            number, invoice date, and the BOTTOM total. Do a targeted label
  //            scan for extra charges (freight/delivery/…). Do NOT parse the
  //            line-item table. Return a confidence 0–1 per required field.
  //            If you cannot read a required field with confidence, say so —
  //            do not guess."
  //
  // The sub-agent returns the §7 object; confidence gating below is identical.
  throw new Error(
    'AI adapter is a documented seam. In the operational skill this is a Sonnet ' +
    'sub-agent (see references/script-contract.md). Use EXTRACT_MODE=textLayer ' +
    'for the deterministic born-digital path.'
  );
}

// =============================================================================
// Orchestrator: document -> §7 record, gated by confidence. Never guesses.
// Returns the §7 object plus _needsHuman / _issues so the caller routes low-
// confidence docs to "Issue reading PDF" instead of the entry path.
// =============================================================================
export async function extractDocument(path) {
  const rec = MODE === 'ai' ? await extractAI(path) : extractTextLayer(await pdfToText(path));

  const issues = [];
  for (const k of REQUIRED) {
    const val = rec[k];
    const c = rec.confidence?.[k] ?? 0;
    if (val == null || val === '') issues.push(`${k} missing`);
    else if (c < CONFIDENCE_FLOOR) issues.push(`${k} low confidence (${c})`);
  }
  rec._needsHuman = issues.length > 0;
  rec._issues = issues;
  return rec;
}

// Map a §7 record to the entry engine's input shape. Only call when !_needsHuman.
export function engineRecord(rec, { source_message_id } = {}) {
  return {
    invoiceNo: rec.invoice_number,
    poNo: rec.po_number,
    amount: rec.total_amount,
    invoiceDate: rec.invoice_date,
    vendor: rec.supplier_name,
    source_message_id: source_message_id ?? null,
    extra_charges: rec.extra_charges ?? [],
  };
}

// CLI: node extract/extract.js <invoice.pdf|.txt>
if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) { console.error('usage: node extract/extract.js <invoice.pdf|.txt>'); process.exit(1); }
  extractDocument(path)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error('extract error:', e.message); process.exit(1); });
}
