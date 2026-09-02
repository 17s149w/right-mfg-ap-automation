# Right Mfg — AP invoice automation

Automates the weekly accounts-payable pass: read supplier invoices, pull the key figures, enter clean two-way PO matches into JobBOSS² via a frozen Playwright engine, and hand back a short report of the judgment calls.

**Design in one line:** the machine does the mechanical 90% safely; every mismatch, low-confidence read, or unknown lands in the report for Ian. Nothing is ever paid on a guess.

> **Runtime & v1 scope.** Runs in **Claude Code** on the machine with Job Boss access + the OneDrive files (the Windows PC) — it uses local Node/Playwright and local files, so it cannot run in Cowork (a sandboxed VM). **v1 processes the scanned-batch folder only.** Email intake (Gmail connector) and the QuickBooks statement check are **Phase 2**. See `CONTINUE-HERE.md` for current status; where older docs (BUILD-PLAN, ONSITE-SESSION-PREP) say "Cowork" or "Mac," `CONTINUE-HERE.md` wins.

## Two skills

| Skill | When | What it does |
|---|---|---|
| **`ap-setup`** | once, on the target machine, attended | Installer. Captures live Job Boss selectors, reconciles vendors, seeds the ledger, proves it with a dry-run. (Connector auth is Phase 2.) |
| **`ap-weekly-run`** | every Friday | Operational. Runs the weekly pass and produces the report. Runs the entry engine — never reads its source. |

The split keeps the daily driver lean: setup knowledge lives in `ap-setup`; the weekly skill just reads the config setup wrote and invokes the engine.

## Architecture

```
Scanned batch (New Scans/)          [Phase 2: Gmail connector, QuickBooks]
        │
        ▼
  extract/  →  §7 JSON  ──┐
  (text-layer | Sonnet)   │
                          ▼
                   src/ entry engine  ──────────────►  JobBOSS²
                   (frozen, deterministic)             (UI automation)
                          │
                          ▼
             ledger.jsonl  +  weekly report      (under OneDrive _AP Automation/)
```

- **`src/`** — the frozen engine. Two-way PO match, four-outcome routing, ledger dedup, report. **Never read into context by the skill; only run.** Money is integer cents; `dry_run` is enforced structurally (the write functions refuse).
- **`extract/`** — document → §7 JSON. Born-digital PDFs use a free text-layer path; scanned pages use a Sonnet sub-agent. Low confidence → "Issue reading," never a guess.
- **`config.example/`** — `settings.json` + `vendors.json` templates that `ap-setup` copies into the working dir.
- **working dir** (`_AP Automation/` under OneDrive) — all state: settings, vendors, `ledger.jsonl`, `reports/`, `pdf-backups/`. Kept out of the synced skill folder. Resolved via `AP_WORK_DIR` or `src/runtime-path.json`.

## The four outcomes (spec Procedure D3)

| Receiver lookup | Amount | Result |
|---|---|---|
| receiver found | matches | **enter**, Send-to-QuickBooks ON |
| receiver found | matches, date differs | **enter** (date overwritten mechanically — not an exception) |
| receiver found | mismatch (e.g. +freight) | **enter with Send-to-QuickBooks OFF**, flag for review |
| no receiver yet | — | **not-yet-received**: enter nothing, hold, recheck next run |

## Try the demo (no Job Boss needed)

```bash
npm install
npm run serve:mock &          # mock JobBOSS² on :4321
npm run run:mock              # runs the 4-outcome sample in dry-run
# or, to watch it in a visible browser with narration + video:
./demo.sh
```

Expect: 2 entered (one date-overwritten), 1 exception (+$60 freight, QB off), 1 not-yet-received, and a report under `data/work/reports/`.

## Install on Ian's Mac

Run the **`ap-setup`** skill and follow its seven steps (environment → Job Boss capture → QuickBooks → Gmail → vendors → seed ledger → verify). It stays in dry-run throughout; going live is a separate decision after clean attended runs.

## Safety

- QuickBooks: **zero writes**, read-only.
- `dry_run` + `seed_mode` short-circuit all writes; enforced in the engine.
- Secrets (Job Boss session, mail/QB auth) live in Keychain / an env file **outside** the synced folders.
- Nothing saves on a mismatch or low-confidence read.

## Key docs

- `AP-Workflow-Spec.md` — the authoritative build spec (from the ride-along with Ian).
- `BUILD-PLAN.md` — what was built and why.
- `ONSITE-SESSION-PREP.md` — the on-site checklist + open questions for Ian (source for the `ap-setup` references).
- `FEASIBILITY.md` — the automation approach and its risks.
