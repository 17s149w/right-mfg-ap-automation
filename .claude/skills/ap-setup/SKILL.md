---
name: ap-setup
description: One-time installer for the Right Mfg AP automation on Ian's Mac. Run this ONCE, with Sylvan present, on the machine that will run the weekly AP job — while JobBOSS², QuickBooks, and the AP Gmail are all logged in. It captures the live Job Boss selectors into the frozen engine, authorizes QuickBooks + Gmail, reconciles the vendor list, seeds the ledger, and proves the whole thing with a dry-run. After this, the ap-weekly-run skill can run unattended. Use when asked to "set up AP automation", "install the AP skill", or "do the on-site setup".
---

# AP setup — the installer

> **Read `CONTINUE-HERE.md` first — it is the source of truth for current state and
> scope, and overrides this file where they differ.** Corrections it carries: runtime
> is **Claude Code on the Windows PC** (not Cowork, not a Mac); **v1 = scanned-batch
> folder only**; **QuickBooks + Gmail are Phase 2** (steps 3 and 4 below are deferred).

You are installing Right Mfg's AP automation on the machine that will run it every week (the **Windows PC**). This is a **one-time, attended** session. Job Boss specifics can't be known until you're logged in here — capturing them live is the whole point.

Work through the steps **in order**, starting with the **runtime check (step 0)** — two minutes that confirm this environment can actually do the job before you invest in it. Each step has a reference file with the exact commands and what to capture. **Load one reference at a time**, do the step, confirm its gate passed, then move on. Announce which step you're on so Sylvan can follow.

## What you're producing

1. A configured **working directory** under OneDrive (`_AP Automation/`) holding `settings.json`, `vendors.json`, and an empty `ledger.jsonl`.
2. The **entry engine's `real` profile filled in** — real Job Boss selectors, captured by codegen while Ian drives, with all four routing outcomes watched live.
3. **[Phase 2]** QuickBooks + Gmail connectors authorized — deferred in v1.
4. A **seeded ledger** so the first real run doesn't re-enter what Ian already keyed by hand.
5. A **dry-run** proving the end-to-end path on real data, reviewed with Ian before anything goes live.

## The seam you're allowed to edit

You may edit exactly two things:
- **`src/config.js` → the `real` profile** (selectors, URLs, `frame`, `autoLookupMode`). This is where captured Job Boss knowledge lands.
- **The working-dir files** (`settings.json`, `vendors.json`, `runtime-path.json`).

**Do not touch the flow logic** (`ap-flow.js`, `index.js`, `ledger.js`, `money.js`, `report.js`). If a selector can't be expressed in a config slot, stop and get Sylvan — don't work around it in the engine.

## Steps (load the reference when you reach the step)

0. `references/00-runtime-check.md` — **do this first.** Confirm this session has local shell + Node and a browser it can drive. Confirms **Claude Code on this machine** is the right runtime (Cowork can't run local Playwright).
1. `references/01-environment.md` — Node + deps, find the OneDrive root, create `_AP Automation/`, wire the working-dir path, copy config templates.
2. `references/02-jobboss-capture.md` — **the big one.** Capture the login session and the AP-entry selectors via codegen; watch all four outcomes live; resolve the receiver-readback mechanic; fill `config.js` real profile.
3. `references/03-quickbooks.md` — **[Phase 2, skip in v1]** authorize a QuickBooks integration usable in Claude Code; verify the read-only aged-item lookup.
4. `references/04-gmail.md` — **[Phase 2, skip in v1]** authorize the AP mailbox via the Gmail connector; confirm the address and the 45-day window.
5. `references/05-vendors-aliases.md` — reconcile vendor names across Job Boss / QuickBooks / Suppliers folders with Ian; finalize `vendors.json` (aliases + auto-pay list).
6. `references/06-seed-ledger.md` — the seeding interview + seed run so the first live run starts with a warm ledger.
7. `references/07-verify.md` — mock demo, then a **dry-run on real data** (just a few test cases), then extraction validation on real invoices; review with Ian; set the go-live switches.

## Rules for this session

- **Secrets never go in synced files.** Job Boss session state and mail/QB auth live in the macOS Keychain or an env file **outside** the OneDrive tree. `config.js` and the working dir both sync — treat them as public.
- **Stay in dry-run.** Leave `settings.json` `dry_run: true` for the whole install. Going live is a later decision after clean attended runs (step 7 explains).
- **Capture, don't guess.** Every selector comes from codegen against the live screen. A `TODO` left in `config.js` is better than a guessed selector that silently mis-enters.
- **Delete the fixtures at the end.** Any real invoice/statement PDFs you pull as test data contain banking info — keep them out of synced folders and remove them when you're done (step 7).
- If you run short on time, the **must-finish** steps are 1, 2, and 6 (environment, Job Boss capture, ledger seed). QuickBooks/Gmail/vendors can be finished in a follow-up; note what's left in `<workDir>/SETUP-STATUS.md`.
