# Implementation Phases & Status

Legend: [ ] not started · [~] in progress · [x] done (with tests)

## Phase 0 — Architecture & Foundations [x]
- [x] Monorepo (pnpm), TypeScript strict, prettier
- [x] Architecture, data model, API, security, frontend, edge-case docs, ADR-0001
- [x] API skeleton: env config, Mongo connection, logging, error handling, validation, response envelope
- [x] Auth: register organization + owner, login, refresh-token rotation, logout, sessions, `me`, change password, organization switch
- [x] Organization, Outlet, User, Membership, Role, Session, AuditLog, IdempotencyKey, DocumentSequence models
- [x] RBAC: permission catalog (shared), `requirePermission`, owner bypass, outlet access checks
- [x] Tenant scoping helpers + isolation tests
- [x] Audit log foundation + query endpoint
- [x] Idempotency middleware (keys are released again on any 4xx/5xx so a corrected retry is not rejected)
- [x] Email provider abstraction (Brevo + console)
- [x] Frontend: Next.js app, design tokens, base components, auth pages, app shell, outlet switcher, settings (organization, outlets, users, roles)
- [x] Marketing landing page (real copy, no fabricated metrics)

## Phase 1 — Core Master Data [x]
- [x] Units (system defaults seeded per organization, lazily for organizations created before seeding existed), categories (nested paths), custom fields (14 types, validation, visibility)
- [x] Products: multi-unit conversions, pricing unit, barcodes (manufacturer + generated internal EAN-13), schedules, stock rules, tags, images/documents via Cloudinary signed uploads
- [x] Suppliers and customers with ledgers, opening balances, credit limits, documents
- [x] Invitations by email
- [x] Web: product list/detail/form, customer & supplier list/detail dialogs, categories & units settings, custom-field settings

## Phase 2 — Inventory [x]
- [x] Batches (per outlet), append-only stock movements ledger, opening stock (form + CSV import)
- [x] Adjustments with reasons and approval workflow, write-offs (expiry/damage), batch block/unblock, batch edits
- [x] Expiry buckets, low stock, stock overview with valuation (permission-gated)
- [x] Web: inventory tabs (stock, batches, expiry, low stock, movements, adjustments, transfers), opening-stock and adjustment forms, barcode label printing

## Phase 3 — Purchases [x]
- [x] Purchase invoices (per-line GST, bill discount, charges, round-off, schemes/free goods), edit while unreceived, cancel with stock reversal
- [x] GRN: receive-now or draft/confirm, partial receipts, short/damaged, batch overrides
- [x] Supplier payments with invoice allocation, supplier ledger + statement, purchase returns (credit note / refund)
- [x] Web: purchase list tabs, purchase form with live totals (shared tax engine), detail with receive dialog, GRN and return pages, pay-supplier dialog

## Phase 4 — POS & Sales [x]
- [x] Server-side quote (FEFO allocation across batches, loose units, price/discount permissions, credit-limit checks, prescription rules)
- [x] Sale creation with split payments, credit (Baki) with due date, walk-in or saved customer, held bills (hold/resume/delete), cancel with reversal
- [x] Web: keyboard-first POS (F2 search / barcode scan on Enter, F4 customer, F8 payment, F9 hold, F12 complete), invoice list with filters, invoice detail with print/download/email/history

## Phase 5 — Returns / Transfers [x]
- [x] Sales returns (resaleable vs damaged/expired, refund or credit note, capped at invoice value), purchase returns
- [x] Stock transfers: request → approve → dispatch (in-transit) → receive with discrepancies; cancel
- [x] Web: return dialogs and detail pages, transfer create/detail with timeline and receive dialog

## Phase 6 — Pharmacy Features [x]
- [x] Prescriptions with private Cloudinary files, medicines, linked sales; schedule H/H1/X enforcement at the POS
- [x] Import (CSV validate → preview → commit; products, customers, suppliers, opening stock) and export (CSV/XLSX for 9 entities)
- [x] Web: prescription list/dialog/detail, import wizard with column mapping and row-level results, export panel

## Phase 7 — Documents [x]
- [x] pdfkit engine with absolutely positioned templates, bindings, flowing tables, barcodes/QR, page numbers
- [x] Template model with versions, per-type system defaults, clone/rename/default/restore, live preview endpoint
- [x] Generated-document history and email (Brevo) with delivery status
- [x] Web: drag/resize designer (palette, bindings, properties, page setup, versions, PDF preview), document action bar on every document

## Phase 8 — Analytics [x]
- [x] Dashboard summary (period comparison, trend, payment mix, top products, alerts, outlets)
- [x] 33 reports with JSON/CSV/XLSX output and permission-sensitive columns
- [x] Notifications: rules, thresholds, role targeting, preferences, scans + in-process scheduler, event handlers
- [x] Web: dashboard with charts, report catalogue and viewer, notification centre and rule settings

## Phase 9 — SaaS [x]
- [x] Plans, feature entitlements (`requireFeature`), usage limits, plan changes with history
- [x] Web: subscription page with usage bars and plan switcher

## Phase 10 — Hardening [~]
- [x] Browser walkthrough of the critical path (product → opening stock → POS sale → invoice PDF → supplier → purchase with receive-now → stock and valuation)
- [x] Fixes from the walkthrough: lazy unit seeding, idempotency release on failure, label/Controller wiring, base-unit switching in the product form, free-goods display on purchases
- [x] Automated critical-path test (`apps/api/src/tests/critical-path.test.ts`) mirroring the walkthrough, plus idempotency release, lazy unit seeding and organization-export tests
- [x] Browser-level Playwright tests (`apps/web/e2e`, `pnpm --filter @pharmaos/web test:e2e`) for the POS sale and purchase/receive flows against the running dev servers
- [x] Gap closure from the spec audit: organization logo and user avatar upload, outlet business hours (also a template binding), connection-status banner with API health ping, POS draft preserved in the browser across refreshes/offline, one automatic retry for GET requests, whole-organization JSON export for business continuity, customer statement email as a payment reminder, login-activity panel, skip-to-content link
- [x] Index review: every list/aggregate query pattern has a matching compound index (see `apps/api/src/models/*.model.ts`)
- [x] Plan billing through Razorpay: server-side order creation, checkout in the browser, HMAC signature verification, webhook fallback with raw-body signature check, subscription invoices with paid periods, `Paid through` on the subscription page. Without keys the owner's manual plan change remains, clearly labelled.
- [x] SMS (MSG91 or Twilio) and WhatsApp (Meta Cloud API) delivery providers behind the messaging service, wired into notification fan-out; console providers record messages in tests
- [x] Web push: VAPID service, per-device subscriptions, service worker (`apps/web/public/sw.js`), enable/disable card in notification settings
- [x] WhatsApp-ready invoice sharing: signed 7-day public links (`/share/:token`) minted only for records the caller's organization owns, `wa.me` deep link with the customer's number, public viewer page
- [x] Automated WCAG 2.1 AA scan with axe-core over the eight busiest screens (`apps/web/e2e/accessibility.spec.ts`); the contrast and select-name findings it raised are fixed
- [x] Dependency audit clean (`pnpm audit --prod`; `uuid` pinned via a pnpm override); security checklist in `docs/SECURITY.md`
- [ ] Before public launch: third-party penetration test, manual screen-reader pass, and provider account setup (Razorpay KYC, DLT-registered SMS templates, WhatsApp Business verification)
