# Feasibility: Automating JobBOSS² AP Invoice Entry via Playwright

**Verdict up front:** Technically feasible and cheap to run. The fill → verify →
branch → save/flag loop is proven end-to-end against a mock today (see below).
The real work and the real risk are **not** in the logic — they're in (a) getting
past login if JobBOSS² uses SSO/MFA, and (b) pinning down stable selectors on an
Ext JS app whose markup changes between vendor updates. Recommend running it
**attended** (human approves each batch), at least until it has a few weeks of
clean runs against your live instance.

---

## 0. What's proven right now

Against the local mock (`npm run serve:mock` + `npm run run:mock`), the script
already does the full loop across 5 sample invoices:

| Case | Input | Outcome |
|------|-------|---------|
| Exact match | INV-5501 / PO-1001, $1250 == $1250 | **SAVED** (or dry-run "would save") |
| Exact match | INV-5502 / PO-1002, $480.50 | **SAVED** |
| Hard mismatch | INV-5503 $8,750 vs PO $9,999 | **FLAGGED**, not saved |
| Rounding | INV-5504 $305.02 vs PO $305.00 | **FLAGGED** at $0 tolerance; **SAVED** at `AP_TOLERANCE=0.05` |
| Unknown PO | INV-5505 / PO-9999 | **FLAGGED** ("PO not found") |

So the decision engine, the tolerance knob, the exceptions report, and the
"never save on doubt" guarantee all work. What's left is wiring the same three
seams (login, navigation, field mapping) to the real ERP.

---

## 0b. What the real screen tells us (from your JobBOSS² screenshot)

Seeing the actual **Vendor Invoice** screen (ECI/JobBOSS²) sharpened the plan and
surfaced one real design point:

- **The two-way match is not a single "PO amount" field.** You relate a PO under
  the **"Related Purchase Orders" sub-tab** (note its `0` badge), and
  **"Invoice Total" is computed from line items**. So the "expected to pay"
  readback the script compares against lives in that sub-tab's grid/total, and
  the flow likely needs to (a) enter the PO / click **Search**, then (b) read the
  related-PO total — possibly after clicking into that sub-tab. This is the one
  spot where I need to watch the real click-path with you; the mock now models it
  this way (PO Search → Related PO row + "Expected to pay" total → verdict).
- **Confirmed, stable-ish labels** to anchor selectors on: *Invoice Number*,
  *Invoice Date*, *Vendor Code/Name*, *Invoice Total*, *Period Number*,
  *Net Due Date* (terms/due auto-derive, exactly as your step 5 describes).
- **Save is a green split-button** (*Save* / caret → *Save and New*), with a
  likely period/confirmation step — a good, explicit save-confirmation marker to
  wait on (helps the duplicate-save guard).
- It's an **Ext JS** app (as expected), so labels may be sibling nodes rather
  than real `<label for>`; codegen will tell us whether `getByLabel` binds or we
  anchor on captured ids. Config already documents the fallback.

The mock (`mock/index.html`) now mirrors this screen — same top bar, left nav,
General layout, Related Purchase Orders grid, and split Save button — so the demo
looks like the product and the field-mapping we validate maps 1:1 to the real one.

## 1. How hard is this, realistically?

**The logic: done.** The branch/compare/report layer is instance-independent and
tested.

**Pointing it at the real JobBOSS²: roughly 1–3 focused days**, dominated by
selector capture and login handling — assuming you can give me a sandbox/test
login. Breakdown:

| Task | Effort | Notes |
|------|--------|-------|
| Confirm login type (form vs SSO/MFA) | 0.5 day | This is the gating question — see §3. |
| Capture real selectors via `playwright codegen` | 0.5–1 day | Fill the `real` block in `src/config.js`. Ext JS markup makes this fiddly. |
| Handle iframe / grid-vs-form layout | 0.5–1 day | If AP entry is in an iframe or an editable grid rather than a plain form. |
| Harden waits for AJAX/PO lookup | 0.5 day | Replace fixed settle time with a real "PO amount populated" wait. |
| Test on 3–5 real invoices against sandbox | 0.5 day | Validate match + mismatch + unknown-PO paths on real data. |

Everything instance-specific is isolated in **one file** (`src/config.js`) plus
the auth strategy. `src/ap-flow.js` and `src/index.js` should not need edits.

---

## 2. Top risks for ERP UI automation, and how this script mitigates each

| Risk | Why it bites | Mitigation in this PoC |
|------|-------------|------------------------|
| **Dynamic / changing selectors** | JobBOSS² is Ext JS; generated classes like `x-form-field-1234` change between builds. | Config prefers **role/label** locators over CSS; header docs the priority order. A vendor update breaks selectors, not logic — you re-capture one file. |
| **Iframes** | AP grid may render in an `<iframe>`; locators silently find nothing. | `config.frame` + `getScope()` transparently scope all field ops to the frame. Set one value, done. |
| **Session timeouts** | Long batches or idle time log you out mid-run; fields vanish. | Login verified via `loggedInMarker`; each invoice re-asserts `apFormMarker`; a failed step flags that invoice and re-navigates rather than corrupting the batch. (For long runs, add a re-login-on-timeout wrapper — noted in code.) |
| **MFA / SSO** | Scripted username+password can't answer an MFA prompt or a redirect to Azure AD/Okta. | Login explicitly throws a clear message if it can't reach an authed page, pointing to the `storageState` workaround (§3). Not silently "stuck." |
| **Slow page loads / AJAX** | PO lookup is async; reading the amount too early gets a stale/empty value. | Generous per-step timeouts (env-tunable); lookup waits for the PO-amount field to be **visible** before reading. *Hardening note:* on the real instance, replace the fixed `lookupSettleMs` with a wait for the value to actually change — placeholder is in `fillAndLookup`. |
| **Pagination / grids** | Entry via an editable grid row instead of a form; or vendor pick lists paginate. | Not in the mock. If the real screen is a grid, the field-map in config still applies (locate the active row's cells); flagged as a possible 0.5–1 day item in §1. |
| **Grid vs form entry** | Same as above — layout unknown until we see the real screen. | Resolver handles input/select/contenteditable and display spans alike (`readValue`), so both layouts are reachable from config. |
| **Accidental duplicate saves** ⚠️ | The scary one for AP: a retry or a double-click creates a **duplicate payable** = double payment. | Multiple guardrails: (1) `dryRun=true` by default — proves the branch without writing; (2) save is clicked **once** and then we **wait for an explicit save-confirmation marker** rather than blind-retrying; (3) on any error the invoice is flagged, **not** retried into a save; (4) recommended: before go-live, add an idempotency pre-check that searches the ERP for the invoice # and skips if it already exists (noted in code as a TODO seam). |

---

## 3. The MFA / SSO question (most important unknown)

- **If JobBOSS² presents a plain username/password form** → the scripted login
  in `src/ap-flow.js` works as-is.
- **If it uses SSO (Azure AD / Okta / SAML) or MFA** → automated password entry
  **will not work**, and per policy the script should not be entering credentials
  or completing MFA challenges anyway. The standard, safe pattern:
  1. A human logs in once, interactively, with `playwright codegen` or a small
     "capture session" script.
  2. Save the authenticated session: `context.storageState({ path: 'auth.json' })`.
  3. The batch script loads it: `browser.newContext({ storageState: 'auth.json' })`
     and skips the login step entirely.
  4. Re-do the manual login whenever the session expires (days–weeks, depending
     on ERP policy).

  This keeps a human in the loop for auth, which is also the right security
  posture. I'll wire this seam once you tell me which login type your instance
  uses.

---

## 4. Is unattended / scheduled running safe?

**Recommendation: keep it attended for now.** At 20–30 invoices/week this is a
5-minute-a-day human-approves-the-batch task, and the failure mode (a wrongly
saved payable) is a real-money error. Specifically:

- **Safe to schedule:** the read-only part — log in, look up each PO, compare,
  and produce the exceptions report. Zero writes.
- **Keep human-approved:** the actual save. Suggested rollout:
  1. **Phase 1 (now):** run in `dryRun=true`. Script produces a report of
     "would save" vs "flagged." Human reviews, saves matches manually. Builds
     trust, catches selector drift with zero risk.
  2. **Phase 2:** `dryRun=false` but **attended** — a person kicks off the batch
     and eyeballs the report. Add the duplicate-check pre-save guard first.
  3. **Phase 3 (optional, later):** scheduled/unattended, but only after weeks of
     clean attended runs, and only with: the idempotency guard, a hard per-run
     cap (e.g. abort if >N would save), session-expiry handling, and alerting on
     any flagged item. Even then, exceptions always wait for a human.

The exit code supports this: the script exits **2** whenever anything is flagged,
so a scheduler/monitor can page a human instead of silently "succeeding."

---

## 5. What I need from you to finish it

1. **A test/sandbox JobBOSS² login** (not production, ideally) — URL + creds, and
   critically **the login type** (plain form vs SSO/MFA).
2. **3–5 sample supplier invoices** (PDFs or just the extracted fields) with
   known POs — including at least one that *should* mismatch, so we validate the
   flag path on real data.
3. **Real selectors captured via `playwright codegen`** against the AP entry
   screen (I can do this live if given sandbox access, or you can run
   `npm run codegen -- "https://your-host"` and send me the output). Specifically
   I need to see: the login form, the vendor-invoice entry screen, how the PO
   amount appears after lookup (button vs auto-on-blur), and the Save control.
4. Confirmation of the **match tolerance** policy ($0 exact, or a small
   freight/tax allowance) and whether partial/multi-PO invoices exist (out of
   scope for v1 — those should just flag).

---

## 6. Why Node (not Python)

Either works; I picked **Node/JavaScript** because:
- `playwright codegen` and the Playwright test tooling are first-class in Node,
  so the selectors you capture paste in verbatim.
- Zero-dependency stack — one runtime, `playwright` is the only prod dep, the
  mock server uses only Node built-ins. Nothing to pip-manage.
- The upstream OCR/extraction step (out of scope) is commonly JS/TS too, so a
  single-language pipeline is easier to hand off.

If your team is Python-first, the port is mechanical (~an hour) — the structure
maps 1:1 to `playwright.sync_api`.

---

## 7. Cost

Running cost ≈ **$0**. It's a deterministic local script driving a headless
browser — no per-invoice API/LLM cost. The only paid piece is the separate AI
extraction step that produces the input JSON, which is out of scope here. At
20–30 invoices/week the whole batch runs in a couple of minutes.
