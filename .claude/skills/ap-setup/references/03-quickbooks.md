# 03 — QuickBooks (Cowork connector, read-only)

Goal: the statement aged-item check (Procedure C2) can look up payment status in QuickBooks. **Read-only. Zero writes, ever.**

## Authorize the Cowork QuickBooks connector

QuickBooks connects through the **Claude Cowork QuickBooks connector** — Cowork owns the connection, so there are **no OAuth tokens to store in the Keychain** and nothing secret lands in a config file.

1. In the Cowork environment that will run the weekly job, enable/authorize the QuickBooks connector (Ian signs in to QuickBooks once through the connector's own flow — you don't handle his password).
2. Confirm the connected company is Right Mfg's QuickBooks.

## Verify the read-only lookup

Use Ian's live example to prove it works end-to-end. Ask him for a recently-aged-but-paid invoice (his ride-along example was **Hogan Rubber, invoice 9997, dated 7/6, due 8/6, paid 8/4**).

Through the connector, look up: **Vendor → invoice by number/date → payment status + payment date.** Confirm you can read back:

- payment status (paid / open)
- payment date
- amount and due date

Confirm **last-4 matching** works: statements often show only the last 4 digits of the invoice number, so the lookup must succeed on **last-4 + vendor + amount + date**, not a full invoice number.

## Record

In `<workDir>/SETUP-STATUS.md` note: connector authorized (y/n), company confirmed, the test lookup result. Do **not** paste any credential.

## Gate

- The connector is authorized and pointed at the right company.
- A known paid invoice reads back **paid + date**; a known open one reads back **open**.
- If the connector can't be authorized in this session, mark it pending — `ap-weekly-run` degrades gracefully (it lists aged rows as "QuickBooks unavailable — verify manually" rather than failing the run). Don't block the rest of setup on it.
