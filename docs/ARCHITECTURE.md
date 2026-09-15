# PharmaOS — System Architecture

> Working product name: **PharmaOS** — a modern operating platform for pharmacies.
> Status: living document. Update whenever an architectural decision changes. See `adr/` for decision records.

## 1. Goals that shape the architecture

| Goal | Architectural consequence |
|---|---|
| Multi-tenant SaaS | Every tenant-owned document carries `organizationId`; access is resolved from the authenticated user, never from client-supplied IDs. |
| Multi-outlet | Operational documents (inventory, sales, purchases, cash) also carry `outletId`. Master data (products, customers, suppliers, roles) is organization-level. |
| Financial + inventory integrity | Money in integer minor units (paise). Quantities in integer base units. Multi-document writes use MongoDB transactions. Idempotency keys on mutating endpoints. |
| Fast POS | Dedicated read paths (search index, batch lookup), server-side pagination everywhere, indexes designed from query patterns. |
| Extensibility | Custom fields, pluggable tax engine, pluggable notification channels, pluggable email provider, template-driven documents. |
| Security | Server-side RBAC, tenant isolation at the repository layer, validated uploads, secure secrets, audit logging. |

## 2. Repository layout (pnpm monorepo)

```
pharmaos/
├── apps/
│   ├── api/                  Node.js + TypeScript REST API (Express 5, Mongoose)
│   └── web/                  Next.js (App Router) frontend + marketing site
├── packages/
│   └── shared/               Types, zod schemas, permission catalog, money/quantity utils shared by api + web
├── docs/                     Architecture, data model, API, security, phases, ADRs
└── (root)                    pnpm workspace, prettier, base tsconfig
```

## 3. Backend architecture (`apps/api`)

### 3.1 Layering

```
HTTP (Express router)
  └── middleware: request-id → logging → security headers → rate limit → auth → tenant context → validation → permission
        └── controller (thin: parse, call service, shape response)
              └── service (business rules, transactions, audit, notifications)
                    └── repository / model (Mongoose; tenant-scoped query helpers)
```

Rules:
- Controllers never touch models directly.
- Services receive a `RequestContext` (`userId`, `organizationId`, `outletId?`, `permissions`, `isOwner`, `requestId`, `ip`) and pass it down.
- All tenant queries go through scoped helpers that inject `organizationId` (and `outletId` where the model is outlet-scoped). Direct `Model.find()` on tenant models is avoided by convention; use `scoped(Model, ctx)`.
- Every service mutation that matters records an `AuditLog` entry within the same transaction when one is open.

### 3.2 Module map

```
modules/
  auth/           register-organization, login, refresh, logout, sessions, password reset
  organizations/  org profile, settings
  outlets/        outlet CRUD, outlet settings, numbering sequences
  users/          users, memberships, invitations
  roles/          system + custom roles, permission catalog
  audit/          audit log write + query
  products/       products, categories, units, unit conversions, barcodes         (Phase 1)
  suppliers/      supplier master, ledger                                         (Phase 1/3)
  customers/      customer master, ledger, credit                                 (Phase 1/4)
  inventory/      batches, stock, movements, adjustments, expiry, opening stock   (Phase 2)
  purchases/      purchase invoices, GRN, purchase returns, supplier payments     (Phase 3)
  sales/          POS, invoices, holds, sales returns, payments, credit           (Phase 4)
  transfers/      stock transfers between outlets                                 (Phase 5)
  prescriptions/  prescription records + secure files                             (Phase 6)
  documents/      PDF engine, templates, versions, rendering, email dispatch      (Phase 7)
  reports/        aggregation-based reports + exports                             (Phase 8)
  dashboard/      dashboard aggregations                                          (Phase 8)
  notifications/  notification center, rules, channels                            (Phase 8)
  custom-fields/  field definitions + value validation                            (Phase 1)
  attachments/    Cloudinary signed upload, metadata, secure access               (Phase 1)
  import-export/  CSV/XLSX import jobs with preview/validation                    (Phase 6/8)
  subscriptions/  plans, entitlements, usage limits                               (Phase 9)
```

### 3.3 Module dependency graph

```
auth ──► users ──► roles ──► organizations ──► outlets
                                  │
products ◄── custom-fields        │
   │                              │
inventory (batches/stock) ◄───────┘
   │           ▲
purchases ─────┘ (GRN increases stock)      suppliers ◄── purchases
   │
sales ─────────► inventory (FEFO decrement) customers ◄── sales
   │
returns/transfers ──► inventory
prescriptions ──► customers, sales, attachments
documents ──► sales, purchases, customers, suppliers (data providers)
reports/dashboard ──► everything (read-only aggregations)
notifications ◄── inventory, sales, purchases (event emitters)
subscriptions ──► gate everything (entitlement middleware)
```

### 3.4 Cross-cutting concerns

- **Config**: `config/env.ts` validates `process.env` with zod at boot. Missing secrets fail fast.
- **Errors**: `AppError` hierarchy (`ValidationError`, `AuthError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `BusinessRuleError`). Central error handler maps to a consistent envelope and never leaks stack traces in production.
- **Validation**: zod schemas (shared with the frontend via `@pharmaos/shared`) applied by `validate({ body, query, params })` middleware.
- **Logging**: pino structured logs, request-id correlation, redaction of secrets/passwords/tokens.
- **Idempotency**: `Idempotency-Key` header on POST endpoints that create financial/inventory documents. Stored per organization with response snapshot.
- **Events**: in-process domain event bus (`events.emit('stock.low', …)`) consumed by the notification module; can be moved to a queue later without changing emitters.
- **Jobs**: scheduled jobs (expiry scan, low-stock scan, overdue reminders) run via an in-process scheduler in Phase 8; designed to be moved to a worker process.

### 3.5 Response envelope

```json
{ "success": true,  "data": { }, "meta": { "page": 1, "pageSize": 25, "total": 120 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ { "path": "email", "message": "…" } ] }, "requestId": "…" }
```

## 4. Tenancy and access model

```
User ──(Membership)──► Organization
Membership { userId, organizationId, roleId, outletAccess: 'all' | ObjectId[], status }
```

- A user may belong to multiple organizations (e.g. a consultant accountant). The access token carries the *active* organization.
- Active outlet is sent via `X-Outlet-Id` header; the middleware verifies the membership grants that outlet; otherwise 403.
- Owner membership implies every permission. Other roles carry an explicit permission list.
- Feature entitlements (Phase 9) are evaluated per organization from its subscription, in a middleware that runs after auth.

## 5. Frontend architecture (`apps/web`)

- Next.js App Router; route groups: `(marketing)` public site, `(auth)` login/register, `(app)` authenticated shell.
- Data fetching via TanStack Query against the API. Auth: short-lived access token in memory + httpOnly refresh cookie; silent refresh on 401.
- Design system in `src/components/ui` (own components built on Radix primitives, Tailwind v4 tokens).
- Feature folders in `src/features/<module>` (api hooks, forms, tables, dialogs). Pages in `src/app/(app)/...` stay thin.
- POS is a dedicated, keyboard-first screen with its own state store (Zustand) and local draft persistence.

## 6. Storage

- MongoDB (replica set required for transactions; local single-node replica set is fine).
- Cloudinary for binary assets; MongoDB stores `{ provider, publicId, resourceType, format, bytes, width, height, secureUrl?, access: 'public' | 'private' }`. Private assets are served via short-lived signed URLs generated on demand after permission checks.

## 7. Numbering

Per-organization, per-outlet, per-document-type sequences stored in `DocumentSequence` and incremented atomically with `findOneAndUpdate({ $inc })` inside the same transaction as the document, guaranteeing no duplicates. Format: `{prefix}{separator}{fyTag?}{number padded}`; financial-year reset is optional.

## 8. Performance strategy

- Indexes designed per query in `DATA-MODEL.md`.
- Product search: compound prefix indexes on normalized `searchTokens` + text index fallback; barcode lookup via unique compound index `(organizationId, barcode)`.
- All lists: page pagination with max page size 100.
- Dashboard: aggregation pipelines over pre-filtered date ranges; daily rollups (`DailySalesSummary`) introduced in Phase 8 for trend charts.
- PDF rendering off the request thread where possible; rendered documents cached by `(documentId, templateVersion)`.

## 9. Environments

- `development`: local Mongo replica set, Cloudinary dev folder, email to console transport.
- `test`: mongodb-memory-server replica set.
- `production`: managed MongoDB (Atlas) with backups, Cloudinary production, real email provider.
