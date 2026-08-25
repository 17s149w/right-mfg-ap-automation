# 02 — JobBOSS² capture (the big one)

This is the step that can only happen here, with Job Boss logged in and Ian driving. You'll (a) capture a login session, (b) resolve how the receiver readback actually works, (c) capture every selector into `config.js` real profile, and (d) watch all four routing outcomes on real screens. Budget the most time here.

## A. Login / session

JobBOSS² is an Ext JS cloud app; login may be a plain form or SSO/MFA.

- **Plain form** → capture the three login selectors below and let the engine log in.
- **SSO/MFA** → scripted login won't work. Capture an authenticated **storageState** instead: Ian logs in by hand in a Playwright browser, then save the session.

```bash
# opens a real browser; log in by hand, navigate to the Vendor Invoice screen,
# then in the codegen window use "Save storage state" (or run the snippet Sylvan has).
npm run codegen -- "https://<jobboss-host>"
```

Save storageState to a file **outside** OneDrive (e.g. `~/.ap-secrets/jb-state.json`) and note the path for Sylvan. Note how long the session lasts before re-auth.

## B. Resolve the receiver-readback mechanic (#1 unknown)

The single thing to nail down: after you type the PO/receiver number, **how does the expected amount appear?**

- Does it **auto-populate** vendor / received-date / expected-amount in the header on blur? → `autoLookupMode: "blur"`, `poLookupBtn: null`.
- Or must you click a **"Search" button**? → `autoLookupMode: "button"`, capture the button.
- Or does the expected amount live under a **"Related Purchase Orders" sub-tab** you must click first? → capture that click as part of the lookup, and point `poAmountField` at the total cell on that tab.

Have Ian do it once slowly and watch which it is. Write the answer into `settings.json` `autoLookupMode` and into `config.js`.

## C. Capture selectors into `config.js` → `real`

Run codegen and, as Ian clicks each field, prefer stable locators (role/label over generated CSS classes — Ext JS regenerates classes). Fill each slot in `src/config.js` under `profiles.real.selectors`:

| Slot | What it is |
|---|---|
| `loginUser` / `loginPass` / `loginSubmit` | login form (skip if using storageState) |
| `loggedInMarker` | something only visible once authed (company name, a nav item) |
| `navToApEntry` | the link to the Vendor Invoice entry screen |
| `apFormMarker` | a stable element unique to the entry screen |
| `invoiceNo` / `poNo` / `invoiceDate` / `amount` | the four entry fields |
| `poLookupBtn` | the Search button, or `null` for blur-mode |
| `poAmountField` | the receiver's expected total (may be a Related-PO grid cell) |
| `receivedDateField` | the date the ERP defaults into the date field |
| `vendorField` / `dueDateField` | optional readback for the report |
| `noReceiverMarker` | **what "no receiver yet" looks like** — an empty grid, a "No records" message, a disabled total. Capture a stable marker. |
| `sendToQbCheckbox` | the Send-to-QuickBooks checkbox |
| `saveAndNewBtn` | Save / Save-and-New (caret menu) |
| `saveConfirmMarker` | proof the save landed (toast, or the next blank form) |

Also set `baseUrl`, `loginPath`, `apEntryPath` (or leave null if nav is a click), and `frame` if the AP grid is inside an `<iframe>`.

## D. Watch all four outcomes live (do NOT save real entries)

Keep `dry_run: true`. With Ian, find one real PO for each case and watch the screen so you know your `noReceiverMarker` and comparison are right:

1. **Clean match** — a PO whose receiver equals the invoice. Fields populate; date can be overwritten; Send-to-QB stays checked.
2. **Date-only difference** — see the date field default to the **received** date and how it's overwritten with the **invoice** date. Confirm this alone is NOT an exception.
3. **Amount mismatch** — a real one (e.g. +$60 freight). See how the mismatch shows; confirm unchecking Send-to-QB is the right move; confirm the entered row shows a non-"Paid" status.
4. **No receiver** — a PO with no receiver yet (an OZB out-of-state one). Confirm what "no record" looks like so `noReceiverMarker` detects it, and that backing out leaves nothing entered.

Then dry-run the engine against real Job Boss to confirm it reads back correctly (step 07 does this formally):

```bash
AP_TARGET=real AP_DRY_RUN=true AP_HEADLESS=false node src/index.js --input <a-few-real-invoices.json>
```

## Gate

- Login works (form or storageState), and `loggedInMarker` is reached.
- A dry-run reads the **receiver's expected amount back correctly** for a known PO (no saves).
- `noReceiverMarker` correctly detects a no-receiver PO.
- All four outcomes observed on real screens and understood.

Any slot you couldn't capture: leave it `TODO`, note it in `<workDir>/SETUP-STATUS.md`, and flag Sylvan — never guess a selector.
