// =============================================================================
// config.js  —  THE ONE PLACE YOU EDIT WHEN POINTING AT THE REAL JobBOSS2.
//
// The ap-setup skill fills the `real` profile's TODO selector slots by running
// `playwright codegen` live on the client's Mac (Job Boss specifics can't be
// known until then). The flow logic in ap-flow.js never hard-codes a selector —
// it always asks config.selectors for one. So moving mock -> real is edits to
// THIS FILE ONLY.
//
// HOW TO FILL IN THE `real` SELECTORS  (done by ap-setup, reference 02)
// -----------------------------------
//   1. npx playwright codegen "https://<your-jobboss2-host>"
//   2. Log in by hand, click to the Vendor Invoice / AP entry screen.
//   3. As you interact, codegen prints locators. Prefer, in this order:
//        getByRole('textbox', { name: 'Invoice Number' })   <- best, stable
//        getByLabel('Invoice Number')  /  getByPlaceholder('...')
//        locator('#stableId')          <- ok if the id is stable
//        locator('.ext-generated')     <- AVOID, Ext JS regenerates these
//   4. Paste the selector into the matching slot below.
//
// JobBOSS2 (ECI) is an Ext JS app: generated CSS classes CHANGE between builds —
// anchor on visible labels/roles, not classes. The AP grid may live in an
// <iframe> (set `frame`). "Save and New" may render as a <span> toolbar button;
// getByRole('button',{name:'Save'}) usually still resolves it.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { paths } from './runtime.js';

const TARGET = process.env.AP_TARGET || 'mock'; // 'mock' | 'real'

// -----------------------------------------------------------------------------
// A selector slot is one of:
//   { css: '#invoiceNo' }                        -> locator(css)
//   { role: 'textbox', name: 'Invoice Number' }  -> getByRole(role,{name})
//   { label: 'Invoice Number' }                  -> getByLabel(label)
//   { placeholder: 'Invoice #' }                 -> getByPlaceholder
//   { text: 'Save and New' }                     -> getByText
// Resolved by resolve() in ap-flow.js — keeps flow code selector-agnostic.
// -----------------------------------------------------------------------------

const profiles = {
  // ===========================================================================
  // MOCK — points at mock/index.html served locally. Fully wired, runs today.
  // Selector IDs here MUST match mock/index.html exactly.
  // ===========================================================================
  mock: {
    baseUrl: process.env.MOCK_URL || 'http://127.0.0.1:4321',
    loginPath: '/',
    apEntryPath: null, // the mock reveals the AP form via the nav click, no route
    frame: null,
    auth: {
      username: process.env.JB_USER || 'demo',
      password: process.env.JB_PASS || 'demo',
    },
    selectors: {
      // --- login ---
      loginUser:   { css: '#login-username' },
      loginPass:   { css: '#login-password' },
      loginSubmit: { css: '#login-submit' },
      loggedInMarker: { css: '#app-shell' },

      // --- navigation to AP entry ---
      navToApEntry: { css: '#nav-ap-entry' },
      apFormMarker: { css: '#ap-form' },

      // --- AP entry form fields ---
      invoiceNo:   { css: '#invoiceNo' },
      poNo:        { css: '#poNo' },
      invoiceDate: { css: '#invoiceDate' }, // editable; ERP pre-fills received date, we overwrite
      amount:      { css: '#amount' },

      // --- PO lookup + receiver readback ---
      poLookupBtn:      { css: '#lookupPo' },
      poAmountField:    { css: '#poAmount' },     // ERP "expected to pay" (receiver total)
      receivedDateField:{ css: '#receivedDate' }, // the date the ERP defaults into the date field
      vendorField:      { css: '#vendorDisplay' },
      dueDateField:     { css: '#dueDateDisplay' },
      // Marker shown when the PO has NO receiver yet -> not-yet-received branch.
      noReceiverMarker: { css: '#noReceiver' },

      // --- routing controls ---
      sendToQbCheckbox: { css: '#sendToQb' }, // checked by default; unchecked on exception

      // --- save ---
      saveAndNewBtn:     { css: '#saveAndNew' },
      saveConfirmMarker: { css: '#save-confirm' },
    },
  },

  // ===========================================================================
  // REAL — TODO placeholders. ap-setup fills these via codegen on the Mac.
  // The comments capture what we learned from a real ECI "Vendor Invoice"
  // screenshot; every value is UNCONFIRMED until validated live (reference 02).
  // ===========================================================================
  real: {
    baseUrl: process.env.JB_URL || 'https://TODO-your-jobboss2-host',
    loginPath: process.env.JB_LOGIN_PATH || '/',
    apEntryPath: process.env.JB_AP_PATH || null,
    frame: null, // TODO: set to { css: 'iframe#content' } if AP entry is in an iframe
    auth: {
      username: process.env.JB_USER || '',
      password: process.env.JB_PASS || '',
    },
    selectors: {
      // --- login ---  TODO capture (may be SSO/MFA -> use storageState instead)
      loginUser:   { label: 'User Name' },
      loginPass:   { label: 'Password' },
      loginSubmit: { role: 'button', name: 'Sign In' },
      loggedInMarker: { text: 'TODO-your-company-name-or-post-login-element' },

      // --- navigation to Vendor Invoice entry ---
      navToApEntry: { role: 'link', name: 'Vendor Invoices' },
      apFormMarker: { text: 'Vendor Invoice' },

      // --- AP entry form fields ---
      invoiceNo:   { label: 'Invoice Number' },
      poNo:        { label: 'PO Number' },   // TODO: may be under a "Related Purchase Orders" sub-tab
      invoiceDate: { label: 'Invoice Date' },// editable; overwrite the ERP-defaulted received date
      amount:      { label: 'Invoice Total' },

      // --- PO lookup + receiver readback ---
      // #1 THING TO RESOLVE LIVE: does typing the PO auto-populate the receiver
      // amount/vendor/date, or must we click a "Related Purchase Orders" sub-tab
      // + "Search" first? Capture the real click-path (reference 02).
      poLookupBtn:      { role: 'button', name: 'Search' }, // TODO confirm; or null if blur-mode
      poAmountField:    { css: 'TODO-receiver-total-cell' }, // expected-to-pay on the Related PO tab
      receivedDateField:{ css: 'TODO-received-date-cell' },  // TODO
      vendorField:      { label: 'Vendor Name' },
      dueDateField:     { label: 'Net Due Date' },
      // TODO: what does "no receiver yet" look like on screen? A grid that stays
      // empty, a "No records" message, a disabled total? Capture a stable marker.
      noReceiverMarker: { text: 'TODO-no-receiver-empty-grid-marker' },

      // --- routing controls ---
      sendToQbCheckbox: { label: 'Send to QuickBooks' }, // TODO confirm exact label

      // --- save ---
      saveAndNewBtn:     { role: 'button', name: 'Save' }, // caret menu = Save and New; TODO confirm
      saveConfirmMarker: { css: 'TODO-save-success-or-blank-form-marker' },
    },
  },
};

const active = profiles[TARGET];
if (!active) throw new Error(`Unknown AP_TARGET="${TARGET}". Use 'mock' or 'real'.`);

// -----------------------------------------------------------------------------
// settings.json (from the working dir) is the source of truth for RUN POLICY —
// dry_run, tolerance, mailbox, window. ap-setup writes it. Env vars override it
// (handy for one-off demo/testing). Missing file -> safe defaults below.
// -----------------------------------------------------------------------------
function loadSettings() {
  try {
    const { settings } = paths();
    if (existsSync(settings)) return JSON.parse(readFileSync(settings, 'utf8'));
  } catch { /* fall through to defaults */ }
  return {};
}
const settings = loadSettings();

const envBool = (v) => v == null ? null : String(v).toLowerCase() !== 'false';
const first = (...vals) => vals.find((v) => v !== null && v !== undefined);

// settings.json uses the spec's field names (snake_case). Map them to what the
// engine reads. v1 ships EXACT match (Q8): price_tolerance_dollars in the
// template is 0.00, but if a future value is set we honor it here (data, not code).
const settingsToleranceCents = settings.toleranceCents != null
  ? settings.toleranceCents
  : (settings.price_tolerance_dollars != null
      ? Math.round(Number(settings.price_tolerance_dollars) * 100)
      : null);
const settingsDryRun = first(settings.dry_run, settings.dryRun);

export const config = {
  target: TARGET,
  ...active,

  // How the receiver amount populates after we type the PO:
  //   'button' -> click selectors.poLookupBtn ; 'blur' -> Tab out of the PO field
  autoLookupMode: process.env.AP_LOOKUP_MODE
    || settings.autoLookupMode
    || (TARGET === 'mock' ? 'button' : 'blur'),

  // Match tolerance in CENTS. v1 = 0 (exact). settings.toleranceCents can raise
  // it later WITHOUT a code change; env AP_TOLERANCE_CENTS overrides for testing.
  toleranceCents: Number(
    first(process.env.AP_TOLERANCE_CENTS, settingsToleranceCents, 0)
  ),

  // Safety: when true, NO save is ever clicked and NO ledger line is written.
  // Enforced structurally in ap-flow.js (the write fns refuse). Default: true.
  dryRun: first(envBool(process.env.AP_DRY_RUN), settingsDryRun, true),

  headless: first(
    envBool(process.env.AP_HEADLESS),
    TARGET === 'mock' ? true : false
  ),
  slowMoMs: Number(process.env.AP_SLOWMO ?? 0),

  timeouts: {
    navigationMs: Number(process.env.AP_NAV_TIMEOUT ?? 45000),
    elementMs: Number(process.env.AP_EL_TIMEOUT ?? 20000),
    lookupSettleMs: Number(process.env.AP_LOOKUP_SETTLE ?? 1500),
  },
};
