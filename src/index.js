// =============================================================================
// index.js — orchestrates one AP run against a list of ALREADY-EXTRACTED
// invoice records (extraction is a separate upstream step; see extract/).
//
// For each invoice:
//   dedup (ledger) -> fill + receiver lookup -> route (4 outcomes) ->
//   enter clean | enter exception (QB off) | hold not-yet-received  ->
//   append ledger -> collect for the report.
//
// Procedure E (recheck still-waiting) is honored implicitly: a not-yet-received
// invoice's PDF stays in the folder, so it reappears in the next run's input and
// gets re-looked-up here; if its receiver now exists it routes CLEAN/EXCEPTION.
//
// SAFETY: config.dryRun is enforced in ap-flow (saves refuse) AND in ledger
// (no line written). Nothing here can write to Job Boss or the ledger in dry-run.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { config } from './config.js';
import {
  login, gotoApEntry, fillAndLookup, overwriteInvoiceDate, route,
  enterClean, enterException, backOut, formatCents,
} from './ap-flow.js';
import {
  loadLedger, statusFor, seenMessage, appendLedger, invoiceKey, openNotYetReceived,
} from './ledger.js';
import { writeReport } from './report.js';
import { paths } from './runtime.js';

const DAY_MS = 86400000;

async function narrate(page, kind, title, body) {
  if ((process.env.AP_NARRATE ?? '').toLowerCase() !== 'true') return;
  await page.evaluate(
    ([k, t, b]) => window.__apNarrate && window.__apNarrate(k, t, b),
    [kind, title, body]
  ).catch(() => {});
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { input: 'data/invoices.sample.json' };
  for (let i = 0; i < args.length; i++) if (args[i] === '--input') out.input = args[++i];
  return out;
}

function loadInvoices(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.invoices;
  if (!Array.isArray(list)) throw new Error(`Input ${path} must be an array or {invoices:[...]}.`);
  for (const [i, inv] of list.entries()) {
    for (const k of ['invoiceNo', 'poNo', 'amount']) {
      if (inv[k] === undefined || inv[k] === null || inv[k] === '') {
        throw new Error(`Invoice[${i}] missing required field "${k}".`);
      }
    }
  }
  return list;
}

// vendors.json is the steering file; absent (e.g. bare mock demo) -> no autopay,
// no new-vendor flags. When present, we key by a normalized vendor name.
function loadVendors() {
  try {
    const { vendors } = paths();
    if (!existsSync(vendors)) return null;
    return JSON.parse(readFileSync(vendors, 'utf8'));
  } catch { return null; }
}
const normVendor = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// vendors.json uses spec §6.1 shape: { vendors:[{ match_names:[...], handling }] }.
// A vendor matches if the invoice's supplier name CONTAINS any match_name (so
// "Waste Management Inc" matches ["Waste Management","WM"]).
function vendorInfo(vendors, name) {
  if (!vendors || !name) return null;
  const target = normVendor(name);
  for (const v of vendors.vendors ?? []) {
    const names = (v.match_names ?? []).map(normVendor).filter(Boolean);
    if (names.some((n) => target.includes(n))) return v;
  }
  return null; // unknown -> new vendor
}
// file_only / auto-pay vendors never hit Job Boss (spec §8 A4).
const isFileOnly = (v) => v?.handling === 'file_only';

async function main() {
  const { input } = parseArgs();
  const invoices = loadInvoices(input);
  const vendors = loadVendors();
  const ledger = loadLedger();
  const isoTimestamp = new Date().toISOString();
  const nowMs = Date.parse(isoTimestamp);

  console.log(`\n=== AP weekly run ===`);
  console.log(`target=${config.target}  dryRun=${config.dryRun}  tolerance=${config.toleranceCents === 0 ? 'exact' : config.toleranceCents + 'c'}  invoices=${invoices.length}`);
  console.log(`workDir=${paths().workDir}\n`);

  const run = {
    target: config.target, dryRun: config.dryRun, toleranceCents: config.toleranceCents, isoTimestamp,
    entered: [], exceptions: [], notYetReceived: [], filed: [], unclassified: [],
    issues: [], newVendors: [], learnedNotes: [], stillWaiting: [],
  };
  const resolvedKeys = new Set(); // NYR keys resolved this run (drop from still-waiting)

  const recordVideo = (process.env.AP_VIDEO ?? '').toLowerCase() === 'true';
  const browser = await chromium.launch({ headless: config.headless, slowMo: config.slowMoMs });
  const context = await browser.newContext(
    recordVideo ? { recordVideo: { dir: 'reports/video', size: { width: 1280, height: 800 } }, viewport: { width: 1280, height: 800 } } : {}
  );
  const page = await context.newPage();

  try {
    await login(page);
    await gotoApEntry(page);

    for (const inv of invoices) {
      const key = invoiceKey(inv.invoiceNo, inv.poNo);
      const vinfo = vendorInfo(vendors, inv.vendor);

      // ---- dedup: layer 1 (message id) then layer 2 (invoice|po) ----
      if (seenMessage(ledger, inv.source_message_id)) { continue; }
      const st = statusFor(ledger, inv.invoiceNo, inv.poNo);
      if (st.action === 'skip') { continue; }
      if (st.action === 'needs_human') {
        run.issues.push({ invoiceNo: inv.invoiceNo, poNo: inv.poNo, reason: 'previously flagged issue_reading' });
        continue;
      }

      // ---- auto-pay / file-only vendors never hit Job Boss ----
      if (isFileOnly(vinfo)) {
        const rec = { invoiceNo: inv.invoiceNo, poNo: inv.poNo, vendor: inv.vendor };
        run.filed.push(rec);
        appendLedger({ status: 'filed', ...rec, isoTimestamp }, { dryRun: config.dryRun });
        continue;
      }

      // ---- new-vendor flag (still processed) ----
      if (vendors && !vinfo && inv.vendor) run.newVendors.push({ vendor: inv.vendor, invoiceNo: inv.invoiceNo });

      try {
        await narrate(page, 'info', `Entering ${inv.invoiceNo}`, `PO ${inv.poNo} · ${formatCents(Math.round(Number(inv.amount) * 100))}`);
        const readback = await fillAndLookup(page, inv);
        const r = route(inv, readback);
        const base = {
          invoiceNo: inv.invoiceNo, poNo: inv.poNo, vendor: inv.vendor ?? readback.vendor ?? null,
          invoiceCents: r.invoiceCents, amountCents: r.invoiceCents, expectedCents: r.expectedCents,
          deltaCents: r.deltaCents, dateMismatch: r.dateMismatch, reason: r.reason,
        };

        if (r.outcome === 'NOT_YET_RECEIVED') {
          await backOut(page);
          // preserve original first_seen across rechecks
          const prior = ledger.byKey.get(key);
          const first_seen = prior?.first_seen ?? isoTimestamp;
          run.notYetReceived.push({ ...base, first_seen });
          appendLedger({ status: 'not_yet_received', ...base, isoTimestamp,
            extra: { first_seen } }, { dryRun: config.dryRun });
          await narrate(page, 'flag', `⏳ ${inv.invoiceNo}`, `No receiver yet — holding.`);
        } else if (r.outcome === 'EXCEPTION') {
          await overwriteInvoiceDate(page, inv);
          const res = await enterException(page);
          run.exceptions.push({ ...base, saved: res.saved });
          resolvedKeys.add(key);
          appendLedger({ status: 'entered_exception', ...base, isoTimestamp }, { dryRun: config.dryRun });
          await narrate(page, 'flag', `⚠ ${inv.invoiceNo}`, `${r.reason} — Send-to-QB OFF, flagged.`);
          if (!config.dryRun) await gotoApEntry(page); // clean form after a real save-and-new confirm
        } else { // CLEAN
          await overwriteInvoiceDate(page, inv);
          const res = await enterClean(page);
          run.entered.push({ ...base, saved: res.saved });
          resolvedKeys.add(key);
          appendLedger({ status: 'entered', ...base, isoTimestamp }, { dryRun: config.dryRun });
          await narrate(page, 'saved', `✓ ${inv.invoiceNo}`, r.dateMismatch ? 'Matched (date overwritten).' : 'Clean match.');
          if (!config.dryRun) await gotoApEntry(page);
        }
      } catch (err) {
        run.issues.push({ invoiceNo: inv.invoiceNo, poNo: inv.poNo, reason: err.message.slice(0, 160) });
        await narrate(page, 'flag', `⚠ ${inv.invoiceNo}`, `${err.message.slice(0, 80)} — needs a human.`);
        await gotoApEntry(page).catch(() => {});
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // ---- still-waiting (aging) from the ledger, minus anything resolved now ----
  for (const rec of openNotYetReceived(ledger)) {
    if (resolvedKeys.has(rec.key)) continue;
    const seen = Date.parse(rec.first_seen ?? rec.ts ?? isoTimestamp);
    run.stillWaiting.push({
      invoiceNo: rec.invoiceNo, poNo: rec.poNo, vendor: rec.vendor,
      ageDays: Number.isFinite(seen) ? Math.floor((nowMs - seen) / DAY_MS) : null,
    });
  }

  const { jsonPath, mdPath } = writeReport(run);
  printSummary(run, jsonPath, mdPath);
  process.exitCode = (run.exceptions.length || run.issues.length) ? 2 : 0;
}

function printSummary(run, jsonPath, mdPath) {
  console.log(`--- ${run.entered.length} entered · ${run.exceptions.length} exceptions · ${run.notYetReceived.length} not-yet-received · ${run.issues.length} issues ---\n`);
  const rows = [
    ...run.entered.map((r) => ({ ...r, status: run.dryRun ? 'WOULD_ENTER' : 'ENTERED' })),
    ...run.exceptions.map((r) => ({ ...r, status: 'EXCEPTION_QB_OFF' })),
    ...run.notYetReceived.map((r) => ({ ...r, status: 'NOT_YET_RECEIVED' })),
  ].map((r) => ({
    invoiceNo: r.invoiceNo, poNo: r.poNo,
    invoice: formatCents(r.invoiceCents), expected: formatCents(r.expectedCents),
    delta: r.deltaCents == null ? '—' : formatCents(r.deltaCents),
    status: r.status,
  }));
  if (rows.length) console.table(rows);
  if (run.newVendors.length) console.log(`🆕 new vendors: ${run.newVendors.map((v) => v.vendor).join(', ')}`);
  console.log(`\n📄 report: ${mdPath}\n            ${jsonPath}\n`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exitCode = 1;
});
