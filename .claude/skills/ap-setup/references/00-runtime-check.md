# 00 — Runtime check (do this FIRST, before anything else)

Two minutes that decide whether this environment can do the job. This install needs **three capabilities in one session**: local shell, a real browser it can drive, and the QuickBooks + Gmail connectors. If a capability is missing, better to know now than 40 minutes in.

Run each check and report the result to Sylvan before proceeding.

## 1. Local shell + Node

```bash
node --version && npm --version && pwd
```

Expect Node v18+ and the repo path. This confirms you can run the engine and codegen locally. **If this fails, stop** — the Job Boss automation has to run on this Mac; there is no remote fallback for it.

## 2. A real browser it can drive

```bash
npx playwright --version
```

Then confirm a browser actually launches (headed):

```bash
node -e "const {chromium}=require('playwright');chromium.launch({headless:false}).then(async b=>{const p=await b.newPage();await p.goto('about:blank');console.log('browser OK');await b.close()}).catch(e=>{console.error('browser FAILED:',e.message);process.exit(1)})"
```

- `browser OK` → good, using Playwright's bundled Chromium.
- If it fails because the **Chromium download was blocked** (corporate network), fall back to the Mac's installed Google Chrome: re-run with `AP_BROWSER_CHANNEL=chrome` (the engine honors it), and use `npm run codegen -- --channel=chrome "<url>"` in step 02. Note which one you used in `SETUP-STATUS.md`.

## 3. The connectors (QuickBooks + Gmail)

Confirm both connectors are available **in this same session** (not a different environment):
- **QuickBooks** — needed for the statement aged-item check (step 03).
- **Gmail** — needed to read the AP mailbox (step 04).

If both are present here alongside the shell + browser above → this is the right runtime; proceed. If a connector is **not** available in this local session, that's OK — it's not a blocker:
- The Job Boss capture, extraction, and ledger seed (steps 01, 02, 06 — the must-finish core) are all local and don't need connectors.
- Mark the missing connector **pending** in `SETUP-STATUS.md`. The weekly run degrades gracefully (aged statement rows get listed as "verify manually" instead of failing), and you can authorize the connector in a follow-up.

## Gate

- Shell + Node work (hard requirement).
- A browser launches (bundled Chromium, or Chrome via `AP_BROWSER_CHANNEL=chrome`).
- QuickBooks + Gmail connector status recorded (present, or noted pending).

Write the three results into `<workDir>/SETUP-STATUS.md` (create it now — it's your running log for this session), then continue to `01-environment.md`.
