# 04 — Gmail (AP mailbox)

Goal: the run can list the AP mailbox and read invoice/statement attachments.

## Confirm the mailbox

- Address: **ian@mixright.com** (confirmed Q3) — verify this is the mailbox where supplier invoices and emailed statements actually land. If AP mail goes somewhere else, use that.
- Statements arrive in the **same** mailbox as invoices (confirmed Q11).

## Authorize the connector

Authorize the Gmail connector for that mailbox in the environment that runs the weekly job (Ian signs in through the connector's own flow; you don't handle his password). Confirm you can list recent messages and read an attachment.

## Confirm the window behavior (don't change code, just verify understanding)

`settings.json` sets `email_window_days: 45`. The run lists a **rolling 45-day window, read AND unread**, then dedups against the ledger by `source_message_id` **before** downloading anything. It does **not** scope by unread (unread is Ian's fragile manual marker). After processing, messages are **marked read and left in the inbox** (Ian keeps them as a searchable record — no archiving).

The wide window is only safe from run 2 onward, once the ledger is warm — which is exactly why step 06 seeds the ledger and the first run uses `seed_mode`.

## Gate

- The correct mailbox is confirmed and the connector lists messages + reads an attachment.
- Note in `<workDir>/SETUP-STATUS.md`: mailbox address, connector authorized (y/n).
