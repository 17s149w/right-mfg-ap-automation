// =============================================================================
// ledger.js — the append-only memory of what we've already handled.
//
// WHY: the weekly run reads the same mailbox/folders repeatedly. Without a
// durable record we'd re-enter the same invoice twice. The ledger is the single
// source of truth for "have we already dealt with this?" and it drives BOTH
// layers of dedup and the not-yet-received recheck.
//
// FORMAT: one JSON object per line (jsonl), append-only. We never rewrite a
// line — status changes are appended as NEW lines and the latest wins. This is
// crash-safe (a half-written last line is simply ignored) and auditable (the
// whole history of an invoice is grep-able).
//
// TWO-LAYER DEDUP:
//   Layer 1 — source_message_id: set the moment we see an email, BEFORE download.
//             Stops us re-processing the same email attachment.
//   Layer 2 — normalized invoice|po key: set AFTER extraction. Stops us entering
//             the same invoice that arrived by two paths (scanned AND emailed).
//   Vendor is deliberately NOT in the key — the same invoice from the same
//             vendor must collide regardless of how the vendor name was spelled.
//
// STATUSES (latest line for a key wins):
//   entered            — keyed into Job Boss (Send-to-QB on)
//   entered_exception  — keyed into Job Boss with Send-to-QB OFF, flagged
//   filed              — auto-pay / file-only vendor, filed not entered
//   not_yet_received   — no receiver in Job Boss yet; recheck next run
//   seen               — email seen (layer-1), not yet extracted
//   issue_reading      — extraction failed / low confidence; needs a human
// =============================================================================

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { paths } from './runtime.js';

// ---- normalization: the heart of layer-2 dedup ----------------------------
// uppercase, strip every non-alphanumeric, strip leading zeros. So "inv 007",
// "INV-7", "Inv#0007" all normalize to "INV7". Applied to invoice and PO alike.
export function normalize(v) {
  if (v == null) return '';
  let s = String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  s = s.replace(/^0+(?=[0-9])/, ''); // strip leading zeros but keep a lone "0"
  return s;
}

export function invoiceKey(invoiceNo, poNo) {
  return `${normalize(invoiceNo)}|${normalize(poNo)}`;
}

// ---- read: fold the append-only log into "latest state per key" -----------
// Returns two maps: byKey (invoice|po -> latest record) and byMsg (Set of
// source_message_ids we've already seen).
export function loadLedger() {
  const { ledger } = paths();
  const byKey = new Map();
  const byMsg = new Set();
  if (!existsSync(ledger)) return { byKey, byMsg, path: ledger };
  const lines = readFileSync(ledger, 'utf8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let rec;
    try { rec = JSON.parse(t); } catch { continue; } // skip a torn last line
    if (rec.source_message_id) byMsg.add(rec.source_message_id);
    if (rec.key) byKey.set(rec.key, rec); // later line overwrites earlier = latest wins
  }
  return { byKey, byMsg, path: ledger };
}

// ---- lookups the orchestrator uses ----------------------------------------
export function seenMessage(state, messageId) {
  return messageId != null && state.byMsg.has(messageId);
}

// What should we do with this invoice given history?
//   'process'  — not seen, go ahead
//   'skip'     — already entered/filed/exception; do nothing
//   'recheck'  — was not_yet_received; try the match again this run
//   'needs_human' — previously flagged as issue_reading
export function statusFor(state, invoiceNo, poNo) {
  const rec = state.byKey.get(invoiceKey(invoiceNo, poNo));
  if (!rec) return { action: 'process', prior: null };
  switch (rec.status) {
    case 'entered':
    case 'entered_exception':
    case 'filed':
      return { action: 'skip', prior: rec };
    case 'not_yet_received':
      return { action: 'recheck', prior: rec };
    case 'issue_reading':
      return { action: 'needs_human', prior: rec };
    default:
      return { action: 'process', prior: rec };
  }
}

// All still-open not-yet-received items, for the recheck pass (Procedure E) and
// the "still waiting" section of the report.
export function openNotYetReceived(state) {
  const out = [];
  for (const rec of state.byKey.values()) {
    if (rec.status === 'not_yet_received') out.push(rec);
  }
  return out;
}

// ---- write: append one line. The ONLY mutator. -----------------------------
// `dryRun` is honored STRUCTURALLY: when true we do not touch the file, we just
// return the record we WOULD have written. This keeps the ledger clean during
// demos and dry-runs while the report still shows intended outcomes.
export function appendLedger({
  status, invoiceNo, poNo, vendor, amountCents, expectedCents,
  source_message_id, isoTimestamp, extra = {},
}, { dryRun } = {}) {
  const rec = {
    ts: isoTimestamp,            // caller supplies (workflow-safe: no Date.now here)
    status,
    key: invoiceKey(invoiceNo, poNo),
    invoiceNo, poNo, vendor,
    amountCents: amountCents ?? null,
    expectedCents: expectedCents ?? null,
    source_message_id: source_message_id ?? null,
    ...extra,
  };
  if (dryRun) return { ...rec, _dryRun: true };
  const { ledger } = paths();
  mkdirSync(dirname(ledger), { recursive: true });
  appendFileSync(ledger, JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}
