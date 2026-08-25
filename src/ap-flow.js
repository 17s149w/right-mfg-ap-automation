// =============================================================================
// ap-flow.js — the fill -> lookup receiver -> route -> enter/flag/hold loop.
//
// INSTANCE-AGNOSTIC: never a raw selector, always config.selectors + resolve().
// mock -> real is edits to config.js only, never this file.
//
// THE FOUR OUTCOMES (spec Procedure D3). After we type invoice# + PO and the ERP
// looks up the RECEIVER (proof the goods arrived):
//   1. no receiver          -> NOT_YET_RECEIVED  (back out, recheck next run)
//   2. amount matches        -> CLEAN            (enter, Send-to-QB left ON)
//   3. amount matches, date differs -> CLEAN too (enter; date is a mechanical
//                                      overwrite, NOT an exception)
//   4. amount mismatch (price/freight) -> EXCEPTION (enter with Send-to-QB OFF,
//                                      flag for a human)
// Only #4 is an "exception". A date difference alone is never one.
//
// dryRun is enforced STRUCTURALLY: enterClean/enterException REFUSE to click
// save when config.dryRun is true. There is no code path that saves in dry-run.
// =============================================================================

import { config } from './config.js';
import { compareAmounts, parseCents, formatCents } from './money.js';

// ---- selector resolver: {css|role|label|placeholder|text} -> Locator --------
export function resolve(scope, slot, { optional = false } = {}) {
  if (slot == null) {
    if (optional) return null;
    throw new Error('Selector slot is null but was required.');
  }
  if (slot.css) return scope.locator(slot.css);
  if (slot.role) return scope.getByRole(slot.role, { name: slot.name, exact: false });
  if (slot.label) return scope.getByLabel(slot.label, { exact: false });
  if (slot.placeholder) return scope.getByPlaceholder(slot.placeholder);
  if (slot.text) return scope.getByText(slot.text, { exact: false });
  throw new Error(`Unrecognized selector slot: ${JSON.stringify(slot)}`);
}

async function getScope(page) {
  if (!config.frame) return page;
  const fl = config.frame.name
    ? page.frame({ name: config.frame.name })
    : page.frameLocator(config.frame.css);
  if (!fl) throw new Error('Configured frame not found on page.');
  return fl;
}

// ============================================================================
// STEP 1: login
// ============================================================================
export async function login(page) {
  const url = new URL(config.loginPath, config.baseUrl).toString();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigationMs });

  await resolve(page, config.selectors.loginUser).fill(config.auth.username, { timeout: config.timeouts.elementMs });
  await resolve(page, config.selectors.loginPass).fill(config.auth.password, { timeout: config.timeouts.elementMs });
  await resolve(page, config.selectors.loginSubmit).click({ timeout: config.timeouts.elementMs });

  await resolve(page, config.selectors.loggedInMarker)
    .waitFor({ state: 'visible', timeout: config.timeouts.navigationMs })
    .catch(() => {
      throw new Error(
        'Login did not reach an authenticated page. If Job Boss uses MFA/SSO ' +
        '(Azure AD / SAML), scripted form login will NOT work — capture a ' +
        'storageState session instead (see ap-setup reference 02).'
      );
    });
}

// ============================================================================
// STEP 2: navigate to the Vendor Invoice / AP entry screen
// ============================================================================
export async function gotoApEntry(page) {
  const nav = resolve(page, config.selectors.navToApEntry, { optional: true });
  if (nav) {
    await nav.click({ timeout: config.timeouts.elementMs });
  } else if (config.apEntryPath) {
    await page.goto(new URL(config.apEntryPath, config.baseUrl).toString(), {
      waitUntil: 'domcontentloaded', timeout: config.timeouts.navigationMs,
    });
  }
  const scope = await getScope(page);
  await resolve(scope, config.selectors.apFormMarker)
    .waitFor({ state: 'visible', timeout: config.timeouts.navigationMs });
}

// ============================================================================
// STEP 3: type the header (invoice# + PO) and trigger the receiver lookup.
// Returns the raw readback: { noReceiver, poAmountRaw, receivedDateRaw, vendor, dueDate }.
// NOTE we do NOT fill the invoice date yet — the ERP defaults the date field to
// the received date on lookup, and we overwrite it afterward (STEP 4).
// ============================================================================
export async function fillAndLookup(page, inv) {
  const scope = await getScope(page);
  const S = config.selectors;

  await resolve(scope, S.invoiceNo).fill(String(inv.invoiceNo), { timeout: config.timeouts.elementMs });
  await resolve(scope, S.poNo).fill(String(inv.poNo), { timeout: config.timeouts.elementMs });
  await resolve(scope, S.amount).fill(String(inv.amount), { timeout: config.timeouts.elementMs });

  // Trigger the ERP's receiver lookup.
  if (config.autoLookupMode === 'button') {
    const btn = resolve(scope, S.poLookupBtn, { optional: true });
    if (btn) await btn.click({ timeout: config.timeouts.elementMs });
  } else {
    await resolve(scope, S.poNo).press('Tab'); // fire the onblur AJAX
  }
  await page.waitForTimeout(config.timeouts.lookupSettleMs);

  // Did the PO come back with NO receiver? That's outcome #1.
  const noReceiver = await isNoReceiver(scope);
  if (noReceiver) {
    return { noReceiver: true, poAmountRaw: null, receivedDateRaw: null, vendor: null, dueDate: null };
  }

  const poField = resolve(scope, S.poAmountField);
  await poField.waitFor({ state: 'visible', timeout: config.timeouts.elementMs });
  return {
    noReceiver: false,
    poAmountRaw: await readValue(poField),
    receivedDateRaw: await readOptional(scope, S.receivedDateField),
    vendor: await readOptional(scope, S.vendorField),
    dueDate: await readOptional(scope, S.dueDateField),
  };
}

// "no receiver" detection: the marker slot is present AND visible. Optional —
// if the slot isn't configured we treat "no marker" as "receiver present".
async function isNoReceiver(scope) {
  const marker = resolve(scope, config.selectors.noReceiverMarker, { optional: true });
  if (!marker) return false;
  try { return await marker.isVisible(); } catch { return false; }
}

// ============================================================================
// STEP 4: overwrite the date field with the INVOICE date (mechanical, not an
// exception). Only meaningful when we're going to enter.
// ============================================================================
export async function overwriteInvoiceDate(page, inv) {
  if (!inv.invoiceDate) return;
  const scope = await getScope(page);
  const f = resolve(scope, config.selectors.invoiceDate, { optional: true });
  if (!f) return;
  await f.fill(String(inv.invoiceDate), { timeout: config.timeouts.elementMs });
}

// ============================================================================
// STEP 5: route. Pure decision — no clicks. Returns the outcome + evidence.
//   outcome: 'NOT_YET_RECEIVED' | 'CLEAN' | 'EXCEPTION'
//   dateMismatch: true when amount matched but ERP date != invoice date
// ============================================================================
export function route(inv, readback) {
  if (readback.noReceiver) {
    return { outcome: 'NOT_YET_RECEIVED', reason: 'no receiver in Job Boss yet',
      invoiceCents: parseCents(inv.amount), expectedCents: null, deltaCents: null, dateMismatch: false };
  }
  const cmp = compareAmounts(inv.amount, readback.poAmountRaw, config.toleranceCents);
  const dateMismatch = Boolean(
    inv.invoiceDate && readback.receivedDateRaw &&
    String(inv.invoiceDate).trim() !== String(readback.receivedDateRaw).trim()
  );
  if (!cmp.match) {
    return { outcome: 'EXCEPTION', reason: cmp.reason,
      invoiceCents: cmp.invoiceCents, expectedCents: cmp.expectedCents, deltaCents: cmp.deltaCents, dateMismatch };
  }
  return { outcome: 'CLEAN',
    reason: dateMismatch ? 'amount matches; date overwritten (mechanical)' : 'clean match',
    invoiceCents: cmp.invoiceCents, expectedCents: cmp.expectedCents, deltaCents: cmp.deltaCents, dateMismatch };
}

// ============================================================================
// STEP 6a: CLEAN entry — leave Send-to-QB ON, Save and New.
// STRUCTURAL dry-run guard: refuses to save when config.dryRun.
// ============================================================================
export async function enterClean(page) {
  if (config.dryRun) return { saved: false, dryRun: true };
  const scope = await getScope(page);
  await ensureSendToQb(scope, true);
  await clickSave(scope);
  return { saved: true, dryRun: false };
}

// STEP 6b: EXCEPTION entry — UNCHECK Send-to-QB, Save and New, then flag.
export async function enterException(page) {
  if (config.dryRun) return { saved: false, dryRun: true };
  const scope = await getScope(page);
  await ensureSendToQb(scope, false); // the whole point: keep it out of QuickBooks
  await clickSave(scope);
  return { saved: true, dryRun: false };
}

// STEP 6c: NOT YET RECEIVED — enter nothing. Re-navigate to a clean form so the
// half-typed header doesn't bleed into the next invoice.
export async function backOut(page) {
  await gotoApEntry(page).catch(() => {});
}

// ---- save helpers ----------------------------------------------------------
async function ensureSendToQb(scope, shouldBeChecked) {
  const box = resolve(scope, config.selectors.sendToQbCheckbox, { optional: true });
  if (!box) return; // not configured -> leave ERP default
  try {
    const checked = await box.isChecked();
    if (checked !== shouldBeChecked) await box.click({ timeout: config.timeouts.elementMs });
  } catch { /* if it isn't a real checkbox, skip rather than crash the run */ }
}

async function clickSave(scope) {
  await resolve(scope, config.selectors.saveAndNewBtn).click({ timeout: config.timeouts.elementMs });
  await resolve(scope, config.selectors.saveConfirmMarker)
    .waitFor({ state: 'visible', timeout: config.timeouts.navigationMs });
}

// ---- field readers ----------------------------------------------------------
async function readValue(locator) {
  const tag = (await locator.evaluate((el) => el.tagName)).toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return await locator.inputValue();
  return (await locator.textContent())?.trim() ?? '';
}
async function readOptional(scope, slot) {
  const loc = resolve(scope, slot, { optional: true });
  if (!loc) return null;
  try { return await readValue(loc); } catch { return null; }
}

// re-export for callers/tests
export { parseCents, formatCents };
