# BUILD PLAN — deliverable TODAY (post-compaction execution spec)

> **Read this + `AP-Workflow-Spec.md` + `ONSITE-SESSION-PREP.md` after compaction.**
> This is the authoritative checklist to build the shippable package. Goal:
> clone-ready repo with **two skills**, so Sylvan can install + verify + dry-run
> on Ian's Mac in a **1-hour session** today. Job Boss specifics are NOT known
> until logged in on that Mac — the **setup skill captures them live** and fills
> the **skeleton engine**.

## Locked decisions
- **Ship operational skill WITH frozen `src/` engine.** Setup only ever edits
  `src/config.js` (selectors/URLs) + the OneDrive working area — never flow logic.
- **Two skills:** `ap-weekly-run` (operational) + `ap-setup` (installer agent).
- **Setup is a skill**, not a README (it runs interactive capture/seed/verify).
- **Extraction:** AI OCR via **Sonnet sub-agents** for scanned batches; text-layer
  path for born-digital PDFs; **defer Docling** (volume too low to justify install).
  Behind one interface → §7 JSON. Low-confidence → "Issue reading PDF", never guess.
- **Tolerance v1 = exact match** (Q8). $5/percentage/per-vendor deferred.
- **QuickBooks = Cowork QB connector, read-only.** No OAuth tokens in Keychain.
- **Two locations:** skill *code* in the Cowork skill package; *working state*
  (config, ledger, reports, PDF backups) in **OneDrive `_AP Automation/`**.
- **dry_run enforced structurally** — write functions refuse when dry_run=true.
- **Money = integer cents** end-to-end.
- **New vendor (Q8/#8):** still run the match, ALWAYS flag in report (flag ≠ skip).
- **Unclassified (#12):** report as "unclassified", don't process.
- **Statements arrive in the same Gmail mailbox (#11).**

## Confirmed-answered questions (don't re-ask Ian)
Job Boss = UI automation (Q1) · Gmail (Q2) · ian@mixright.com (Q3) · `2026 August`
= filename (Q5) · No File Center, Claude does OCR+files (Q7) · extra_charges list
= yes (Q14) · #8 new-vendor flag+match · #11 same mailbox · #12 unclassified.

## Still-open for Ian (from ONSITE-SESSION-PREP §B — carry into session)
Both-emailed (Q10) · full auto-pay list (Q6) · not-yet-received aging (Q9) ·
multi-PO per invoice (Q13) · receipt-not-keyed lag (Q12) · always-review vendors ·
report delivery/cc · spare-Mac readiness.

---

## Final package structure (repo = `ap-automation/`)

```
ap-automation/
  .claude/skills/
    ap-weekly-run/              # OPERATIONAL skill (lean daily driver)
      SKILL.md                  # precheck config → run engine → assemble report
      references/
        script-contract.md      # HOW TO RUN the engine, expected output, statuses,
                                 #   failure modes. Agent runs the script, never reads src/.
      assets/
        report-template.md      # §13.2 report skeleton
    ap-setup/                   # SETUP skill (one-time installer agent)
      SKILL.md                  # orchestrates install; loads references per step
      references/
        01-environment.md       # node/deps install, OneDrive root + Files-On-Demand,
                                 #   create _AP Automation/ working area
        02-jobboss-capture.md   # codegen the 4 states live; fill src/config.js real
                                 #   profile; the readback-mechanic resolution (#1)
        03-quickbooks.md        # authorize Cowork QB connector; verify C2 lookup
        04-gmail.md             # authorize mailbox; confirm address
        05-vendors-aliases.md   # dump JobBoss/QB/folder vendor lists; reconcile →
                                 #   vendors.json alias map
        06-seed-ledger.md       # B1b seeding interview (cutoff, already-handled, NYR)
        07-verify-dry-run.md    # run mock demo, then dry-run real, review report, gate
  src/                          # deterministic engine — NEVER read into context, only run
    config.js                   # mock profile wired; real profile = SKELETON, TODO slots
    ap-flow.js                  # login/nav/fill/lookup + 4-OUTCOME routing + date overwrite
                                 #   + send-to-QB uncheck + save-and-new
    ledger.js                   # append-only jsonl; normalize(); dedup (msg-id + inv|po)
    money.js                    # parse to integer cents; compare at cents
    report.js                   # build §13.2 report from ledger (works in dry-run)
    index.js                    # orchestrator; structural dry_run; runs Procedure E first
  extract/
    extract.js                  # PDF→§7 JSON; textLayer adapter + ai(Sonnet) adapter iface
  mock/
    index.html  serve.js        # REFRESH: demo all 4 branches (match / mismatch /
                                 #   no-receiver / date-mismatch) + received-vs-invoice date
  data/
    invoices.sample.json        # demo inputs covering 4 branches
  config.example/               # templates copied to OneDrive working area by setup
    vendors.json                # §6.1 steering file (seed w/ WM, Century, OZB, Hyd Ctrl, O'Reilly)
    settings.json               # §6.2 (dry_run true, exact match, mailbox, window 45, seed_mode)
  package.json  README.md  PLAN.md  FEASIBILITY.md
  AP-Workflow-Spec.md  ONSITE-SESSION-PREP.md  BUILD-PLAN.md
```

**Runtime seam:** setup writes the OneDrive working-area path where the engine
reads/writes state (env `AP_WORK_DIR` or `src/runtime-path.json`). vendors.json +
settings.json + ledger.jsonl + reports/ + pdf-backups/ live under `AP_WORK_DIR`,
NOT in the synced skill folder.

---

## Per-file build spec (build now; Job Boss slots left TODO)

### `src/config.js` (extend existing)
- Keep mock profile (works today).
- Real profile: keep TODO slots; ADD slots for the 4-outcome flow:
  `dateField` (editable), `sendToQbCheckbox`, `noReceiverMarker` (text/selector that
  means "PO returned no receiver"), `enteredRowStatus` (to confirm non-Paid on save).
- Header comment: "these slots are filled by the ap-setup skill via codegen."

### `src/ap-flow.js` (extend existing match/mismatch)
- `fillHeader()` — New → invoice# → PO/receiver.
- `readback()` — resolve vendor/date/expectedAmount (mechanic TBD on-site; support
  both auto-populate and Related-PO sub-tab via config).
- `route()` — **4 outcomes** per D3: no-receiver→NYR, clean→D4, date-only→D4,
  price/freight→D6.
- `cleanEntry()` — overwrite date w/ invoice date; leave Send-to-QB checked; Save&New.
- `exceptionEntry()` — **uncheck Send-to-QB**; Save&New.
- `notYetReceived()` — back out, no entry.
- All write actions gated by structural dry_run refusal.

### `src/ledger.js` (new)
- Append-only `ledger.jsonl`. `normalize(v)` = uppercase, strip non-alphanumeric,
  strip leading zeros. Key = `normalize(inv)|normalize(po)`. Store raw values too.
- `lookup(key)` → not-present | entered/filed/exception (skip) | not_yet_received (recheck).
- Layer-1 dedup on `source_message_id` (email) before download.

### `src/money.js` (new) — parse to integer cents; compare at cents; exact-match v1.

### `src/report.js` (new) — build §13.2 structured report from ledger; dry-run aware.

### `src/index.js` (extend) — orchestrator: Procedure E recheck FIRST, then batch,
then email; structural `dry_run`; exit 2 if exceptions.

### `extract/extract.js` (extend existing) — §7 fields incl. extra_charges targeted
label scan + confidence + page_range; textLayer adapter (born-digital) + ai adapter
interface (Sonnet); emit §7 JSON. Low-confidence → needs-human.

### `mock/index.html` + data — refresh to demo all 4 branches + date field, so the
client demo runs today with Job Boss stubbed.

### `config.example/vendors.json` + `settings.json` — seed from §6.1/§6.2.

### Skill files — write `ap-weekly-run/SKILL.md` (+ script-contract.md, report
template) and `ap-setup/SKILL.md` (+ the 7 references, which are the executable
form of ONSITE-SESSION-PREP §A).

---

## Build order for the session (fast path)
1. Skill scaffolding + config.example templates (cheap, unblocks all).
2. `ap-setup` skill (references 01–07) — **the actual 1-hour-session deliverable**;
   it must be good enough that Claude-on-Ian's-Mac executes the install.
3. `ap-weekly-run` SKILL.md + script-contract.md + report template.
4. Engine build-now: ledger.js, money.js, report.js, extract.js; ap-flow 4-outcome
   with Job Boss slots TODO; index.js structural dry_run.
5. Mock refresh → dry-run demo produces a real report from sample data.
6. README quickstart (clone → run mock demo → run ap-setup on the Mac).

## Definition of done for TODAY
- Repo clones clean; `npm install` works.
- **Mock dry-run runs end-to-end** and emits a §13.2 report (client-demoable).
- **`ap-setup` skill** is complete enough to drive the 1-hour on-Mac install:
  capture Job Boss selectors → fill config skeleton → authorize QB+Gmail → seed
  ledger → dry-run verify.
- Engine skeleton compiles with clearly-marked Job Boss TODO slots.
