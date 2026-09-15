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
- [x] Idempotency middleware
- [x] Email provider abstraction (Brevo + console)
- [x] Frontend: Next.js app, design tokens, base components, auth pages, app shell, outlet switcher, settings (organization, outlets, users, roles)
- [x] Marketing landing page (real copy, no fabricated metrics)

## Phase 1 — Core Master Data [ ]
Products, categories, units & conversions, barcodes, suppliers, customers, custom fields, attachments (Cloudinary), invitations by email.

## Phase 2 — Inventory [ ]
Batches, stock ledger (movements), opening stock, adjustments w/ reasons + approval, expiry categories, low stock, barcode assign/print.

## Phase 3 — Purchases [ ]
Purchase invoice, GRN (partial receipt, short/damaged), supplier payments, purchase returns, supplier ledger.

## Phase 4 — POS & Sales [ ]
Search, scan, FEFO batch selection, loose units, discounts, GST, split payments, credit, hold/resume, invoice numbering.

## Phase 5 — Returns / Transfers [ ]
Sales returns, purchase returns, stock transfers (request → dispatch → receive), reconciliation, damaged/expired write-off.

## Phase 6 — Pharmacy Features [ ]
Prescriptions (private files), schedule categories, schemes, advanced expiry, import/export.

## Phase 7 — Documents [ ]
PDF engine, template model + versions, designer, email invoices, print profiles (A4/thermal), document history.

## Phase 8 — Analytics [ ]
Dashboard, reports, notification center + rules, scheduled scans.

## Phase 9 — SaaS [ ]
Plans, entitlements, usage limits, org management.

## Phase 10 — Hardening [ ]
Security/perf/index/tenant/permission/UX/a11y reviews, e2e tests.
