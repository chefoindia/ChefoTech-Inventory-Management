# Pharmacy Edge Cases & How the Platform Handles Them

| # | Edge case | Handling |
|---|---|---|
| 1 | Same medicine, multiple batches with different MRP/expiry | `ProductBatch` per (product, batchNumber, MRP). Stock tracked per outlet per batch. POS shows batch, expiry, MRP. |
| 2 | FEFO selection | Default batch = earliest expiry with qty > 0 and not expired/blocked. Manual override needs `sales.chooseBatch`. |
| 3 | Expired stock | Nightly + on-read check marks `Stock.expiryDate < today` unsellable; POS query excludes it; write-off workflow moves it to `expiry` movement. |
| 4 | Near-expiry | Configurable thresholds; optional block of sale within N days (`blockNearExpirySaleDays`). |
| 5 | Loose sale (2 strips + 3 tablets) | Quantity converted to base units via unit factor; stock stored in base units only. Whole-unit rule prevents fractional base units. |
| 6 | Unit conversion changes after stock exists | Unit factors on a product are immutable once movements exist; new unit definitions can be added. |
| 7 | Partial GRN / short / damaged / excess | GRN lines carry ordered/received/short/damaged; purchase status becomes `partially_received`; excess requires `purchases.receiveExcess`. |
| 8 | Free quantity (buy 10 get 1) | `freeQty` recorded; inventory increases by paid + free; unit cost = paid amount / (paid+free) for valuation; reports show free qty separately. |
| 9 | Different purchase price per batch | Cost captured per batch and snapshotted per movement; profit uses batch cost. |
| 10 | Price change after invoices exist | Product/batch price edits never touch existing sale/purchase documents (snapshots). |
| 11 | Tax rate change | Rate snapshotted on lines; new rate applies from effective date; HSN changes audited. |
| 12 | Split payments | `payments[]` array; sum validated = paid; remainder becomes credit only if customer selected and within credit limit. |
| 13 | Credit limit exceeded | Server rejects unless `customers.overrideCreditLimit`; audit entry on override. |
| 14 | Walk-in customer | `customerId` null, snapshot name "Walk-in"; credit disallowed; email prompt skipped. |
| 15 | Customer without email | Email step hidden; "add email now" inline option. |
| 16 | Cancelled bill | Status `cancelled`, reverse movements appended (never deleted), ledger reversal, payment reversal record; requires `sales.cancel`; time window configurable. |
| 17 | Duplicate barcode | Unique index per org; UI offers to view the conflicting product. |
| 18 | Missing barcode | Internal barcode generation (org prefix + sequence, EAN-13 check digit) and label printing. |
| 19 | Barcode scanner as keyboard | POS listens for fast keystroke bursts ending in Enter; search input handles both. |
| 20 | Concurrent billing on same batch | Conditional decrement `{ qtyBase: { $gte: n } }` inside transaction; loser gets `INSUFFICIENT_STOCK` and POS refreshes availability. |
| 21 | Duplicate request (double click, retry) | Idempotency-Key required on POS submit; replay returns original invoice. |
| 22 | Network drop mid-sale | Draft persisted locally; submit uses the same idempotency key on retry; server never creates two invoices. |
| 23 | Negative stock | Impossible by construction (conditional updates); adjustments cannot take stock below zero. |
| 24 | Unauthorized discount / price override | Max discount per role; override beyond limit needs `sales.overrideDiscount`; audited. |
| 25 | Unauthorized stock adjustment | Adjustments above a configurable value need approval (`inventory.approveAdjustment`). |
| 26 | Transfer discrepancy | Received < dispatched creates `discrepancy` record; sender outlet keeps in-transit qty until resolved. |
| 27 | Sales return of a loose quantity | Return line references original sale line and batch; qty ≤ sold − already returned; returns restock only if `condition: 'resaleable'`. |
| 28 | Purchase return of consumed stock | Return qty ≤ current batch stock at outlet. |
| 29 | Schedule H/H1/X drugs | Product schedule; H1/X require prescription link at POS; H1 register report. |
| 30 | Inter-state supply | Place of supply vs outlet state decides CGST+SGST vs IGST. |
| 31 | Composition scheme supplier/org | Tax engine respects registration type; invoice labels change. |
| 32 | Invoice regeneration | PDF is regenerated from stored snapshot + template version; original rendered file kept in history. |
| 33 | Email/PDF failure | Sale commits first; document generation and email are follow-up jobs with status and retry, never blocking the sale. |
| 34 | Financial-year rollover | Sequences keyed by FY when reset enabled; FY start month configurable. |
| 35 | Outlet closed / staff moved | Membership outlet access edits take effect on next request; sessions not invalidated unless status suspended. |
| 36 | Rounding | Bill-level round-off to nearest rupee (configurable), stored as `roundOffMinor`. Line tax computed per line in minor units using banker-neutral half-up rounding; totals are sums of lines. |
| 37 | Multiple organizations for one user | Organization switcher issues new tokens; no cross-org data in any response. |
| 38 | Product deactivated with stock | Allowed; hidden from POS search but visible in stock reports; reactivation restores. |
| 39 | Customer merge / duplicate phone | Duplicate phone warning; merge tool (later phase) re-points ledger and sales. |
| 40 | Opening balances | Opening stock creates `opening` movements and batches; opening balances create `opening` ledger entries; all auditable and importable. |
