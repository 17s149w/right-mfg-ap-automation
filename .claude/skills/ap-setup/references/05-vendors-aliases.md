# 05 — Vendor reconciliation & aliases

Goal: `vendors.json` steering file reflects Ian's real vendors, with the name aliases that let one vendor be recognized across Job Boss, QuickBooks, and the Suppliers folder — and the full auto-pay (file-only) list.

Do this **with Ian** — it's ~20 minutes of his time and it prevents a class of silent failures (a vendor spelled three ways in three systems).

## 1. Dump the three vendor lists

- **Suppliers folder** names:
  ```bash
  ls -1 "$AP_ONEDRIVE/Suppliers"
  ```
- **Job Boss** vendor list (from the Vendors screen — read it on screen or export if available).
- **QuickBooks** vendor list (via the Cowork connector, or on screen).

## 2. Reconcile with Ian

Line the three lists up and have Ian resolve mismatches. The known example is **"Hogan Rubber" (statement) = "Hose & Rubber" (QuickBooks)** — there will be more. For each real vendor, collect every spelling into `match_names`.

The engine matches an invoice's supplier name if it **contains** any `match_names` entry (normalized), so include the shortest reliable token (e.g. `"OZB"`, `"Century"`).

## 3. Finalize the auto-pay / file-only list

Ian named Waste Management, business insurance (Century), and "some bank records" — **get the complete list and which banks** (Q6). Each file-only vendor gets `"handling": "file_only"` and a `folder`. These never hit Job Boss or QuickBooks — they're filed for the record only.

## 4. Mark known-behavior vendors

Carry over the steering hints from the template and confirm with Ian:
- `expect_not_yet_received: true` (OZB — out of state, invoice beats goods; don't report as anomaly)
- `expect_price_mismatch: true` (Hydraulic Controls — kits reconfigured, almost never matches)
- `statement_note` (O'Reilly — messy statements, review every aged row)
- Ask: any **"always review"** vendors he wants never auto-entered even on a clean match?

## 5. Write it

Edit `<workDir>/vendors.json` (not the template in `config.example/`). Keep the shape from the template: `{ vendors: [ { match_names, folder, handling, why, … } ] }`.

## Gate

- Every vendor Ian names is in `vendors.json` with all its aliases.
- The auto-pay list is complete (including the specific banks).
- Sanity check the file parses:
  ```bash
  node -e 'JSON.parse(require("fs").readFileSync(process.env.AP_WORK_DIR+"/vendors.json"));console.log("vendors.json OK")'
  ```
