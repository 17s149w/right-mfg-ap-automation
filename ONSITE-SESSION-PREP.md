# On-Site Session Prep — Right Mfg / Ian

> Companion to `AP-Workflow-Spec.md`. Two parts:
> **A.** What must be captured/configured **on site with Job Boss (and QB) logged in.**
> **B.** Questions for Ian (his four + the additional open ones), each with a
> suggested default so he can mostly just confirm.
>
> Goal of the live session: watch the real screens produce a **full match, a
> price mismatch, a no-receiver (not-yet-received), and a date mismatch**, and
> capture the exact selectors/click-path for each — so the frozen entry script
> can reproduce them.

---

## A. On-site setup & live-capture checklist

### A0. Access & environment (do first — everything depends on it)
- [ ] **Job Boss login type** — plain user/password form, or SSO/MFA? Capture an
      authenticated session (`storageState`) so the script skips login. Note how
      long the session lasts before re-auth (spec 16.5: browser should remember,
      may re-auth occasionally).
- [ ] **QuickBooks access — DECIDED: Cowork QuickBooks connector** (read-only).
      Cowork owns the connection, so **no OAuth tokens to store in Keychain** (spec
      16.5 QB half resolved). Ian authorizes the connector **once** at setup;
      confirm live it can do the C2 lookup (vendor → invoice → payment status + date).
- [ ] **Gmail (AP mailbox)** — confirm the exact mailbox address and authorize the
      connector. Confirm it's Gmail (Q2 answered: yes).
- [ ] **OneDrive on the spare Mac** — capture the **real root path** and **exact
      folder names**; check **Files-On-Demand** mode (on/off) and confirm invoice
      folders **materialize** (not zero-byte placeholders). Record in setup notes.
- [ ] **Credential storage** — put QB tokens + mail creds in **macOS Keychain or an
      env file OUTSIDE the OneDrive tree** (config/skill folders sync). Run
      connection tests against QB + mailbox before building on top.

### A1. Job Boss core loop — capture selectors AND watch all four states
Run `playwright codegen` against the live AP entry screen while Ian drives.

- [ ] **Resolve the readback mechanic (#1 priority).** Does typing the PO/receiver
      number auto-populate vendor/date/expected-amount in the header (per spec D1),
      or does the expected amount live under the **"Related Purchase Orders"
      sub-tab** (per the screenshot)? Capture the actual click-path.
- [ ] Capture selectors for: **New** button · **Invoice number** field ·
      **PO/receiver** field · auto-populated **vendor** · **date** field (editable) ·
      **expected amount** · **Send to QuickBooks** checkbox · **Save and New** button
      (and confirm Save-and-New vs Save-and-Close both exist).
- [ ] **Full/clean match** — pick a PO whose receiver amount equals the invoice.
      Watch: fields populate, date overwrite, Send-to-QB stays checked, Save and New.
- [ ] **Price mismatch** — a real one (e.g. Iron Bear +$60 freight, $4,504 vs
      $4,444). Watch: how the mismatch shows; uncheck Send-to-QB; Save and New;
      confirm the entered row shows a **non-"Paid" status**.
- [ ] **No receiver → not-yet-received** — a PO with **no receiver yet** (an OZB
      out-of-state one). Confirm what "no record" looks like on screen so the script
      can detect it, and that backing out leaves nothing entered.
- [ ] **Date mismatch** — see the date field default to the **received date** and
      how to overwrite it with the **invoice date**. Confirm this alone is *not* an
      exception (mechanical correction).

### A2. QuickBooks statement check (Procedure C2)
- [ ] Have Ian walk the live lookup: **Vendor → find invoice by number/date → read
      payment status + payment date** (his example: Hogan Rubber inv 9997, due 8/6,
      paid 8/4). Capture the exact query path (MCP call or screen path).
- [ ] Confirm **last-4 matching** is acceptable (statements show only last 4 digits;
      match on last-4 + vendor + amount + date).

### A3. Data reconciliation with Ian (live, ~20–30 min each)
- [ ] **Vendor alias table (Q11 / 16.6)** — dump vendor lists from **Job Boss**,
      **QuickBooks**, and the **Suppliers/ folder**; reconcile all three with Ian in
      one sitting; write the alias map into `vendors.json`. ("Hogan Rubber" =
      "Hose & Rubber" is one confirmed case; there are more.)
- [ ] **Auto-pay / file-only list (Q6)** — get the full list (he named Waste
      Management, business insurance, "some bank records" — which banks?).
- [ ] **Ledger seeding interview (B1b)** — ask, don't infer:
      through what date has he **already entered by hand** (cutoff)? anything after
      it already handled (seed `entered`)? anything now sitting in **Not Yet
      Received** (seed with real `first_seen`)?

### A4. Fixtures
- [ ] Grab **last week's real scan batch** + a handful of **emailed invoices** and
      **one emailed statement** as test fixtures. ⚠️ Contains banking material —
      keep out of any synced/shared location; scrub at project close (spec §17).

---

## B. Questions for Ian

### B0. Ian's current four (with suggested defaults)
1. **Email exceptions AND the report — both?** *(spec Q10)* — Suggest: **yes to
   both**; exception email fires only when the queue is non-empty, full report
   emailed every run + saved to `_AP Automation/reports/`.
2. **Full auto-pay vendor list** *(Q6)* — need the complete list, incl. which bank
   records.
3. **Not-yet-received aging** *(Q9)* — Suggest: **every report lists everything
   still waiting** (with age + "expected for this vendor?"), *and* we set a soft
   escalation threshold (e.g. flag >3 weeks). Confirm the threshold.
4. **Can one invoice cover multiple POs?** *(Q13)* — Suggest default: **assume one**
   for v1; if it happens, key becomes `invoice# + primary PO#` with the rest as a
   list. Confirm it's rare/none.

### B1. Additional questions (not in his four)
5. **Perfect-match-first — confirm the trade** *(Q8)*: v1 flags **any** penny
   difference as an exception (more exceptions, zero wrong auto-entries). OK for v1,
   revisit $5/percentage/per-vendor later?
6. **Freight / short-ship stays manual in v1?** — v1 **flags** price mismatches and
   freight lines; it does **not** add the GL-5600 freight row or compute what was
   shorted. Confirm that's the intended v1 boundary.
7. **Receipt-not-yet-keyed lag** *(Q12)*: goods physically here but receipt not
   entered (the Iron Bear case) looks identical to not-yet-received. Is a **one-week
   lag** (caught on next Friday's recheck) acceptable, or does he want same-day
   arrivals called out separately?
8. **New/unknown vendor handling** — when an invoice arrives from a vendor **not in
   `vendors.json`**, what should happen? Suggest: **flag in report as "new vendor —
   confirm handling"**, don't auto-file or auto-enter on a guess.
9. **Any "always review" vendors?** — vendors he wants **never auto-entered even on
   a clean match** (e.g. first invoice from a new supplier, or a known-flaky one)?
10. **Scanned statements** — confirm these just get filed to `Statements/` for his
    **monthly manual review** (only *emailed* statements get the automated aged
    check). *(spec C1)*
11. **Where do statements arrive?** — same AP mailbox as invoices, or separate?
12. **Non-invoice / non-statement email** — the AP inbox surely gets other mail.
    Confirm unclassifiable attachments should be **reported as "unclassified,"** not
    processed.
13. **Report delivery + cc** — dry-run report: just in the conversation, saved file,
    emailed, or all three? Anyone besides Ian to cc?
14. **Spare Mac readiness** — is it already set up with OneDrive synced, Job Boss
    reachable, and QuickBooks reachable? Any admin/password constraints we'll hit?

### B already-answered in §15 (no need to re-ask)
- Job Boss = **UI automation** (Q1). Mailbox = **Gmail** (Q2). Email =
  **ian@mixright.com** (Q3). `2026 August` = **filename** (Q5). **No File Center** —
  Claude does OCR + file management (Q7). `extra_charges` label list = **yes** (Q14).
