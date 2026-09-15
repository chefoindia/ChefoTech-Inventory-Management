# PharmaOS — working notes for AI assistants and new contributors

## What this is
Multi-tenant, multi-outlet pharmacy operations platform. pnpm monorepo: `apps/api` (Express 5 + Mongoose 9 + zod 4), `apps/web` (Next.js App Router + Tailwind v4 + Radix + TanStack Query), `packages/shared` (schemas, permission catalog, money utils). Docs in `docs/`; roadmap and status in `docs/PHASES.md`.

## Commands
- `pnpm --filter @pharmaos/shared build` — required once before running api/web (they import the built package).
- `pnpm dev:api` / `pnpm dev:web` — dev servers on :4000 / :3000. `.claude/launch.json` has both.
- `pnpm test` — shared unit tests + api integration tests (mongodb-memory-server replica set; binary cached in `node_modules/.cache/mongodb-memory-server`).
- `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Non-negotiable rules
1. Money = integer minor units (paise); percentages = basis points. Use helpers in `packages/shared/src/money.ts`.
2. Quantities = integers in the product base unit. Unit factors convert for display only.
3. Tenant scoping: every query on an org-owned model goes through `orgFilter`/`outletFilter`/`findOrgDocOrThrow` in `apps/api/src/lib/scoped.ts`. `organizationId` comes from `req.ctx`, never from the request body.
4. `mongoose.set('sanitizeFilter', true)` is global. Server-built operator values (`$in`, `$ne`, `$gt`…) must be wrapped by `trustedFilter()` (orgFilter/outletFilter already do this). Forgetting it produces a loud CastError, not a silent wrong query.
5. Permissions live in `packages/shared/src/permissions.ts`; guard routes with `requirePermission`. Non-owners can only grant permissions they hold.
6. Money/stock documents: create inside `withTransaction`, reserve numbers with `nextDocumentNumber` in the same transaction, guard the endpoint with `idempotent({ required: true })`, and write `audit()` in the same session.
7. Historical documents snapshot prices/names/units; never recompute old invoices from current product data.
8. No fake UI: unimplemented modules appear disabled in the sidebar with the phase they ship in. Do not add placeholder pages with dummy numbers.
9. Every list view has loading, empty and error states; every form maps server field errors via `applyServerErrors`.

## Adding a module (pattern)
`apps/api/src/modules/<name>/{<name>.service.ts,<name>.routes.ts}` → mount in `apps/api/src/app.ts` → schemas/types in `packages/shared/src/schemas` and `types/api.ts` → hooks in `apps/web/src/features/<name>/api.ts` → pages under `apps/web/src/app/(app)/`. Add tests in `apps/api/src/tests/` using `registerTenant`/`addMember` helpers.

## Environment
`apps/api/.env` (git-ignored) holds the Atlas URI (non-SRV form because the local resolver refuses SRV; set `DNS_SERVERS=8.8.8.8` to use the `mongodb+srv://` form), Brevo key (console email provider is used when empty or in tests), Cloudinary keys, optional Firebase service account for future phone OTP.
