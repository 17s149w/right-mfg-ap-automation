# 06 — Seed the ledger

Goal: the first real weekly run must NOT re-enter the ~45 days of invoices Ian has already keyed by hand. The ledger starts empty, and a 45-day window on an empty ledger would redo all of that. Seeding fixes it.

This is a **must-finish** step — skipping it risks double-entries on the first live run.

## 1. The seeding interview (ask Ian — don't infer)

- **Cutoff:** through what date has he **already entered by hand**? Everything on/before that is "already handled."
- **Handled-but-recent:** anything invoiced *after* the cutoff he's already dealt with? (These should seed as `entered`/`filed_only` so the run skips them.)
- **Currently waiting:** anything sitting in `Shipment Not Yet Received/` right now? Seed each as `not_yet_received` with its real `first_seen` date so aging is correct from day one.

## 2. Seed run (`seed_mode`)

Set the first-run switches in `<workDir>/settings.json`:

```json
{ "dry_run": true, "seed_mode": true }
```

`seed_mode` = read the full 45-day window, extract, **write the ledger, take NO action**, and report what it *would* have done. This populates `source_message_id` (layer-1 dedup) and the `invoice#|po#` keys (layer-2) for everything already in the window, so run 2 correctly skips them.

Run it and review the "would have done" report **with Ian** — confirm the set of already-entered invoices looks right (that's your proof the dedup will hold).

## 3. Hand-seed the not-yet-received items

For anything Ian says is currently waiting that the window didn't surface, append a `not_yet_received` line per item so Procedure E rechecks it. Use the real `first_seen` date he gives you (this drives the aging / >3-week flag). Keep raw and normalized values per the ledger format.

## 4. Flip out of seed mode

After the seed run and review:

```json
{ "dry_run": true, "seed_mode": false }
```

Leave `dry_run: true` — going live is step 07's decision, not this step's.

## Gate

- `<workDir>/ledger.jsonl` exists and contains a line for each already-handled invoice from the window, plus any hand-seeded not-yet-received items.
- A second dry-run (`seed_mode: false`) now **skips** those invoices (they don't reappear as new). That's the dedup working.
- Ian has confirmed the seeded set looks right.
