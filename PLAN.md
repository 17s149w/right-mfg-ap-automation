# AP Automation — Project Plan (broad strokes / gates)

> Status: draft to be refined once the detailed workflow doc + screen recording
> are provided. V1 = runs **locally on his Mac, attended, triggered by a skill**,
> reads invoices from a **local OneDrive folder**, enters into **JobBOSS² (ECI,
> public cloud)**, produces a report. V1 ALSO includes a **read-only QuickBooks
> lookup** (via the QB MCP) to check "has this been paid already?" — placement in
> the flow (pre-entry duplicate guard vs. separate statement pass) TBD from the
> workflow doc.

## Guiding principles
- **Deterministic where money moves.** The ERP entry step is a frozen Playwright
  script the skill *invokes* — Claude does not hand-click the ERP.
- **Human-in-the-loop.** Nothing saves on a mismatch or a low-confidence extract.
- **Lean operational skill.** Setup knowledge lives elsewhere so the daily-driver
  skill stays short and accurate (see "Skill/repo structure").
- **Idempotent.** Re-running never double-enters (manifest + move-to-done folder).
- **Self-learning — but only the knowledge base, never the money path.** The
  system gets smarter over time by *accumulating structured knowledge on disk*
  (vendor extraction quirks, tolerances, new-vendor entries), NOT by rewriting
  its own scripts. `src/` stays frozen; `references/vendors.md` is the memory
  that grows. This keeps learning auditable (every lesson is a diff you can read)
  and keeps the deterministic entry path immune to drift.

---

## The gates (each must pass before the next)

### G0 — Shared, accurate workflow model  *(blocked on: workflow doc + video)*
- Absorb the real end-to-end AP workflow from the doc/recording.
- Fix V1 scope: what's in (JobBOSS² two-way PO match entry **+ read-only QB
  "already paid?" lookup**) vs. out (multi-PO/partial receipts, GL coding
  nuance, any QB *writes*) — list explicitly.
- Determine **where the QB check sits** in the flow (pre-entry duplicate guard
  vs. separate statement-reconciliation pass).
- Identify the real time-sinks and where the match fits.
- **GATE:** a written, agreed workflow model + a locked V1 scope line.

### G1 — Design updated to current reality
- Rewrite FEASIBILITY/architecture to the V1-local design (Mac, OneDrive files,
  attended, skill-triggered). Retire the cloud-VM/cron and Gmail/Drive-connector
  framing. Note MFA is no longer a V1 blocker (attended local login).
- **GATE:** design doc reviewed by you; no stale assumptions remain.

### G2 — Repo + skill architecture decided & scaffolded
- Lock the two-skill split (lean operational vs. one-time setup) and repo layout.
- Define the **config/state seam**: what setup produces (folder path, captured
  selectors, session/creds handling) that the operational skill consumes.
- **GATE:** repo structure agreed; skeleton dirs/files exist; secrets gitignored.

### G3 — Real JobBOSS² field-mapping validated  *(blocked on: sandbox login)*
- Capture the real selectors via `playwright codegen`, esp. the **Related
  Purchase Orders** click-path (enter PO → Search → read expected total).
- Fill `config.js` `real` profile; confirm labels bind (Ext JS caveat).
- **GATE:** a dry-run against the real ERP logs in, navigates, and **reads a PO
  amount back correctly** — no saves yet.

### G4 — Extraction validated on his real invoices  *(blocked on: 3–5 sample PDFs)*
- Decide template vs. AI per his vendor mix; test on real PDFs from OneDrive.
- Confirm unmatched/low-confidence docs flag to the review list, don't guess.
- **GATE:** representative invoices produce correct JSON; the "couldn't match
  these N" review path works end-to-end in chat.

### G5 — End-to-end V1 on his machine
- Setup skill proven by an actual clone + configure on a clean Mac profile.
- Operational skill runs: read folder → extract → review → **dry-run** entry →
  report. Then flip to live save behind the duplicate-check guard.
- **GATE:** he can clone, run setup, run the operational skill, and get a correct
  report with safe (dry-run first) entries — unaided.

### G4b — QuickBooks "already paid?" lookup validated  *(blocked on: QB MCP auth)*
- Read-only lookup via the QB MCP: given an invoice/vendor, answer "already paid
  / already recorded?" — never writes to QB.
- Wire it at the placement decided in G0 (pre-entry duplicate guard and/or a
  separate statement-reconciliation pass).
- **GATE:** for a known-paid and a known-unpaid invoice, the lookup returns the
  correct status against his real QB; a "paid" result short-circuits entry (no
  duplicate payable).

### G6 — Go-live hardening
- Attended dry-run period; add idempotency guard (skip already-entered invoices);
  per-run safety cap; clear exceptions report.
- **GATE:** N consecutive clean attended runs → enable live saves.

---

## Skill / repo structure (resolves the "lean vs. documented" tension)

Two skills + a config seam. The **golden rule**: the operational skill *runs*
the engine, it does **not read the engine's source into context**. The skill
carries just enough prose *about* the script (contract, expected output, failure
modes) to run it and interpret the result — never the code itself.

```
ap-automation/
  src/                         deterministic engine — NEVER read into context, only run
    config.js                    the one instance-specific file (selectors/urls/knobs)
    ap-flow.js                   fill → lookup → compare → save/flag
    index.js                     orchestrator (loads invoices, loops, writes report)
    qb-check.js                  read-only QuickBooks "already paid?" lookup (via QB MCP)
  extract/                     PDF → invoice JSON (template | AI adapter)
  mock/                        JobBOSS²-styled demo (index.html + serve.js)
  data/                        runtime: invoices-in JSON, needs-review JSON
  reports/                     outputs (gitignored)
  config/                      ← the SEAM: setup writes it, operate reads it
    config.json                  folder path, session/creds handling, run knobs (gitignored)
  .claude/skills/
    process-invoices/          ← LEAN operational skill (the daily driver)
      SKILL.md                   precheck config → run engine → assemble report
      references/
        vendors.md               vendor list + per-vendor allowable deviances (tolerances)
        add-vendor.md            process for adding a new vendor to the list + report
        script-contract.md       how the engine behaves, expected output, failure modes
      assets/
        report-template.md       the run-report template the skill fills in
    setup-ap-automation/       ← ONE-TIME setup skill (verbose OK)
      SKILL.md                   thin index → loads references/* per step
      references/                node/playwright, onedrive path, selectors, login, QB auth
  FEASIBILITY.md  README.md  PLAN.md
```

### The three load-bearing rules
- **Don't read the script — run it.** SKILL.md instructs the agent to *invoke*
  `src/index.js` (and `qb-check.js`) and consume their JSON/exit-code output.
  It must **not** open the source files. This is what keeps runtime context lean
  and the behavior deterministic (the agent can't "improve" the money path).
- **Operational skill stays lean** because setup knowledge is *not in it*. It
  reads what setup wrote to `config/`. If unconfigured → points at setup, stops.
- **The config/ seam is the whole trick:** setup → writes config; operate →
  reads config. Clean separation.

### `references/` in the operational skill (loaded only when needed)
- **`vendors.md`** — the vendor registry. Per vendor:
  - **allowable deviance from expected** (exact-to-the-cent, ±$X freight/tax
    slack, or a %). **PRESET by a human — never learned or auto-adjusted.** The
    engine reads tolerances from here (via `config`), so policy is data, not code
    — editable by a person without touching `src/`. The learning loop below is
    forbidden from touching these values.
  - **extraction notes / known quirks** — free-text learnings about how this
    vendor's PDFs get read or classified *wrong* (e.g. "invoice # and PO # are
    swapped in the header," "amount grabs the subtotal not the total," "scanned,
    needs OCR," "PO printed as `P.O 1234` with a space"). The extraction step
    consults these to avoid repeating a known mistake.
  - **Learning loop:** the agent may **auto-append extraction-quirk notes**
    (low risk — a bad note only causes a flag a human already reviews), and logs
    each one in the report ("learned: …"). **New vendors** are proposed in the
    report and appended only after **human confirmation**. **Tolerances are never
    learned** — preset only. Notes only ever influence *extraction*; the
    deterministic PO-match/entry path stays frozen.
- **`add-vendor.md`** — the **"add a new vendor" process**: how to append a
  vendor + its deviance rule to the registry, and how new/first-seen vendors
  surface **in the report** (flagged as "new vendor — confirm tolerance") so the
  list grows deliberately, never silently.
- **`script-contract.md`** — the **lean spec of the engine** so the agent can run
  and interpret it *without reading the code*:
  - **What it does** (one paragraph: fill → PO lookup → compare → save/flag).
  - **How to run it** (command + the env knobs that matter: dry-run, target).
  - **Expected output** (the report JSON shape; per-invoice statuses:
    `SAVED` / `MATCH_DRYRUN_NOT_SAVED` / `FLAGGED_MISMATCH` / `FLAGGED_ERROR`;
    exit code 2 = something flagged).
  - **Failure modes** (what unexpected output means and what to do): login
    failed (MFA/session) → re-auth; selector not found → config drift, escalate,
    don't guess; PO not found → flag, human keys it; empty/garbled report → treat
    as failed run, nothing saved.

### `assets/` (report template)
- **`report-template.md`** — the run-report the skill fills from the engine's
  JSON: summary counts, the SAVED list, the exceptions/needs-review list (with
  reasons), any new-vendor flags, and QB "already paid" hits. Keeps every run's
  report consistent and skimmable.

### What the setup skill must cover (one-time, on his Mac)
1. Prereqs: Node, `npm install`, `playwright install chromium`.
2. Point at the local **OneDrive folder** (ensure files-on-device, not
   cloud placeholders); write it to `config/config.json`.
3. **Capture JobBOSS² selectors** via codegen (or ship pre-captured from G3).
4. **Login/session**: attended login or captured `storageState`; where creds live.
5. **Authorize the QuickBooks MCP** (interactive OAuth — can't be done headless).
6. Seed **`references/vendors.md`** with the initial vendors + deviances.
7. Verify: run the **mock demo**, then a **dry-run against real** before go-live.
8. Where reports land; how to read the exceptions list.

---

## What I need next (in priority order)
1. **The detailed workflow doc + screen recording** (unblocks G0 → everything).
2. Sandbox JobBOSS² login (unblocks G3).
3. 3–5 real invoice PDFs (unblocks G4).
