// =============================================================================
// money.js — the ONE place money is parsed and compared.
//
// Rule: money lives as INTEGER CENTS everywhere past the parser. Floats like
// 0.1 + 0.2 !== 0.3 have no business anywhere near a payables amount, so we
// convert once at the edge (parseCents) and compare integers thereafter.
//
// v1 tolerance is EXACT MATCH (0 cents) per the client decision. The compare
// still takes a toleranceCents arg so a future per-vendor slack is a data
// change, not a code change — but nothing today passes a non-zero value.
// =============================================================================

// "$1,234.50" | "1234.5" | "USD 1,234" | 1234.5 -> 123450 (integer cents).
// Returns NaN on anything it can't parse — callers MUST treat NaN as "unknown",
// never as zero.
export function parseCents(raw) {
  if (raw == null) return NaN;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return NaN;
    return Math.round(raw * 100);
  }
  const cleaned = String(raw).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return NaN;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

// integer cents -> "$1,234.50" for display in reports.
export function formatCents(cents) {
  if (cents == null || Number.isNaN(cents)) return '—';
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rem = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}$${dollars}.${rem}`;
}

// Compare an invoice amount to the ERP's expected (receiver) amount, both raw.
// Returns { match, invoiceCents, expectedCents, deltaCents, reason }.
//   - deltaCents = invoice - expected  (positive = invoice is higher)
//   - match is true only when |delta| <= toleranceCents AND both parsed.
// A NaN on either side is NEVER a match — it's an error the caller must flag.
export function compareAmounts(invoiceRaw, expectedRaw, toleranceCents = 0) {
  const invoiceCents = parseCents(invoiceRaw);
  const expectedCents = parseCents(expectedRaw);
  if (Number.isNaN(invoiceCents)) {
    return { match: false, invoiceCents, expectedCents, deltaCents: null,
      reason: 'invoice amount unparseable' };
  }
  if (Number.isNaN(expectedCents)) {
    return { match: false, invoiceCents, expectedCents, deltaCents: null,
      reason: 'expected (receiver) amount not found / unparseable' };
  }
  const deltaCents = invoiceCents - expectedCents;
  const match = Math.abs(deltaCents) <= toleranceCents;
  return {
    match,
    invoiceCents,
    expectedCents,
    deltaCents,
    reason: match
      ? 'amount matches receiver'
      : `amount mismatch: invoice ${formatCents(invoiceCents)} vs receiver ${formatCents(expectedCents)} (${deltaCents > 0 ? '+' : ''}${formatCents(deltaCents)})`,
  };
}
