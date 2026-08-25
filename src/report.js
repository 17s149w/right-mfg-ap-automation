// =============================================================================
// report.js — turns a run's records into the weekly report (spec §13.2).
//
// Emits BOTH a machine JSON (for the ledger/audit trail) and a human Markdown
// summary (what the ap-weekly-run skill reads back / emails). Dry-run aware: in
// dry-run the entered items are labelled "would enter" so the report is honest
// about what did vs. would happen.
//
// The operational skill NEVER reads src/ — it runs the engine and consumes this
// output. So this shape IS the contract; keep it stable (see script-contract.md).
// =============================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { formatCents } from './money.js';
import { paths } from './runtime.js';

// `run` = {
//   target, dryRun, toleranceCents, isoTimestamp,
//   entered:[], exceptions:[], notYetReceived:[], filed:[], unclassified:[],
//   issues:[],            // extraction "issue reading" items
//   newVendors:[],        // {vendor, invoiceNo} first-seen, need confirmation
//   learnedNotes:[],      // {vendor, note} auto-appended extraction quirks
//   stillWaiting:[],      // open not-yet-received from the ledger (aging)
// }
export function buildReport(run) {
  const j = toJson(run);
  const md = toMarkdown(run);
  return { json: j, markdown: md };
}

export function writeReport(run) {
  const { json, markdown } = buildReport(run);
  const { reportsDir } = paths();
  mkdirSync(reportsDir, { recursive: true });
  const stamp = run.isoTimestamp.replace(/[:.]/g, '-');
  const base = join(reportsDir, `report-${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(json, null, 2), 'utf8');
  writeFileSync(`${base}.md`, markdown, 'utf8');
  return { jsonPath: `${base}.json`, mdPath: `${base}.md`, json, markdown };
}

function toJson(run) {
  return {
    generatedAt: run.isoTimestamp,
    target: run.target,
    dryRun: run.dryRun,
    toleranceCents: run.toleranceCents,
    summary: {
      entered: run.entered.length,
      exceptions: run.exceptions.length,
      notYetReceived: run.notYetReceived.length,
      filed: run.filed?.length ?? 0,
      unclassified: run.unclassified?.length ?? 0,
      issues: run.issues?.length ?? 0,
      newVendors: run.newVendors?.length ?? 0,
      stillWaiting: run.stillWaiting?.length ?? 0,
    },
    entered: run.entered,
    exceptions: run.exceptions,
    notYetReceived: run.notYetReceived,
    filed: run.filed ?? [],
    unclassified: run.unclassified ?? [],
    issues: run.issues ?? [],
    newVendors: run.newVendors ?? [],
    learnedNotes: run.learnedNotes ?? [],
    stillWaiting: run.stillWaiting ?? [],
  };
}

const line = (r, extra = '') =>
  `- **${r.invoiceNo}** · PO ${r.poNo} · ${r.vendor ?? '—'} · ${formatCents(r.invoiceCents ?? null)}${extra}`;

function toMarkdown(run) {
  const L = [];
  const mode = run.dryRun ? ' _(dry-run — nothing was written)_' : '';
  L.push(`# AP weekly run — ${run.isoTimestamp.slice(0, 10)}${mode}`);
  L.push('');
  L.push(`Target: \`${run.target}\` · tolerance: ${run.toleranceCents === 0 ? 'exact match' : formatCents(run.toleranceCents)}`);
  L.push('');
  L.push('| Outcome | Count |');
  L.push('|---|---|');
  L.push(`| Entered${run.dryRun ? ' (would enter)' : ''} | ${run.entered.length} |`);
  L.push(`| Exceptions (Send-to-QB OFF, review) | ${run.exceptions.length} |`);
  L.push(`| Not yet received | ${run.notYetReceived.length} |`);
  if (run.filed?.length) L.push(`| Filed (auto-pay / file-only) | ${run.filed.length} |`);
  if (run.unclassified?.length) L.push(`| Unclassified | ${run.unclassified.length} |`);
  if (run.issues?.length) L.push(`| Issue reading (needs human) | ${run.issues.length} |`);
  L.push('');

  section(L, run.dryRun ? '✅ Would enter (clean match)' : '✅ Entered (clean match)', run.entered,
    (r) => line(r, r.dateMismatch ? ' · _date overwritten_' : ''));

  section(L, '⚠️ Exceptions — entered with Send-to-QB OFF, need review', run.exceptions,
    (r) => line(r, ` · ${r.reason}`));

  section(L, '⏳ Not yet received (no receiver in Job Boss)', run.notYetReceived,
    (r) => line(r));

  if (run.stillWaiting?.length) {
    L.push(`## ⏳ Still waiting from earlier runs (${run.stillWaiting.length})`);
    L.push('_Confirm these are expected; investigate anything old._');
    for (const r of run.stillWaiting) {
      const age = r.ageDays != null ? ` · ${r.ageDays}d old` : '';
      const flag = r.ageDays != null && r.ageDays > 21 ? ' · **>3 weeks ⚑**' : '';
      L.push(`- **${r.invoiceNo}** · PO ${r.poNo} · ${r.vendor ?? '—'}${age}${flag}`);
    }
    L.push('');
  }

  if (run.filed?.length) section(L, '🗂️ Filed (auto-pay / file-only vendors)', run.filed, (r) => line(r));
  if (run.issues?.length) section(L, '🔧 Issue reading — a human should key these', run.issues,
    (r) => `- **${r.invoiceNo ?? '(unread)'}** · ${r.source ?? ''} · ${r.reason ?? 'low confidence'}`);
  if (run.unclassified?.length) section(L, '❓ Unclassified (not an invoice/statement we recognized)', run.unclassified,
    (r) => `- ${r.source ?? r.file ?? '(item)'} · ${r.note ?? ''}`);

  if (run.newVendors?.length) {
    L.push(`## 🆕 New vendors — confirm handling (${run.newVendors.length})`);
    L.push('_Matched and entered per the rules, but flagged because they aren\'t in `vendors.json` yet. Add them so they file/tolerance correctly next time._');
    for (const r of run.newVendors) L.push(`- **${r.vendor}** (first seen on ${r.invoiceNo})`);
    L.push('');
  }

  if (run.learnedNotes?.length) {
    L.push(`## 🧠 Learned this run (extraction notes auto-appended)`);
    for (const n of run.learnedNotes) L.push(`- **${n.vendor}**: ${n.note}`);
    L.push('');
  }

  return L.join('\n') + '\n';
}

function section(L, title, items, fmt) {
  L.push(`## ${title} (${items.length})`);
  if (!items.length) { L.push('_none_', ''); return; }
  for (const it of items) L.push(fmt(it));
  L.push('');
}
