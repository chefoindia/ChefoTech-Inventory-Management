# PharmaOS — Pharmacy Management & Operations Platform

A multi-tenant, multi-outlet operating platform for pharmacies: products with batches and expiry, keyboard-first POS, purchases and GRN, credit (Baki), returns, transfers, prescriptions, documents, reports and analytics.

Status: **Phase 0 complete** (architecture, auth, organizations, outlets, users, roles/RBAC, audit, idempotency, design system, app shell, settings, marketing page). See [docs/PHASES.md](docs/PHASES.md) for the roadmap and what each phase delivers.

## Monorepo

| Path | What |
|---|---|
| `apps/api` | Node.js + TypeScript REST API (Express 5, Mongoose 9, zod 4, pino) |
| `apps/web` | Next.js App Router frontend (Tailwind v4, Radix primitives, TanStack Query) |
| `packages/shared` | Types, zod schemas, permission catalog, money/quantity helpers shared by both |
| `docs/` | Architecture, data model, API, security, frontend, edge cases, phases, ADRs |

## Quick start

Requirements: Node 20+, pnpm 10, a MongoDB **replica set** (Atlas or a local `rs0`; transactions are required).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # fill MONGODB_URI, JWT_ACCESS_SECRET, (optional) BREVO/CLOUDINARY
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @pharmaos/shared build
pnpm dev                                    # api on :4000, web on :3000
```

Open http://localhost:3000, click **Start free trial**, and register your organization. The first user becomes the Owner with a default `MAIN` outlet and the system roles seeded.

## Scripts

```bash
pnpm typecheck        # all packages
pnpm test             # shared unit tests + api integration tests (in-memory Mongo replica set)
pnpm lint
pnpm build
```

## Key design rules (read before contributing)

- Money is stored as **integer minor units** (paise); percentages as **basis points**. Never floats.
- Quantities are stored in the product's **base unit** as integers; display units convert via factors.
- Every tenant query goes through `orgFilter` / `outletFilter` (`apps/api/src/lib/scoped.ts`). `organizationId` always comes from the token, never from the client.
- `mongoose.sanitizeFilter` is on globally; server-built operator filters are marked trusted via `trustedFilter`.
- Permissions are enforced with `requirePermission` on the API; the web app only uses them to shape the UI.
- Financial and stock documents are written inside `withTransaction` and created through endpoints guarded by `idempotent()`.
- Every meaningful mutation writes an `AuditLog` entry.

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA-MODEL.md](docs/DATA-MODEL.md), [docs/API.md](docs/API.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/FRONTEND.md](docs/FRONTEND.md), [docs/EDGE-CASES.md](docs/EDGE-CASES.md), [docs/adr/](docs/adr/).
