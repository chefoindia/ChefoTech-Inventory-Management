# PharmaOS — working notes for AI assistants and new contributors

## What this is
Multi-tenant, multi-outlet pharmacy operations platform. pnpm monorepo: `apps/api` (Express 5 + Mongoose 9 + zod 4), `apps/web` (Next.js App Router + Tailwind v4 + Radix + TanStack Query), `packages/shared` (schemas, permission catalog, money utils). Docs in `docs/`; roadmap and status in `docs/PHASES.md`.

## Commands
- `pnpm --filter @pharmaos/shared build` — required once before running api/web (they import the built package).
- `pnpm dev:api` / `pnpm dev:web` — dev servers on :4000 / :3000. `.claude/launch.json` has both.
- `pnpm test` — shared unit tests + api integration tests (mongodb-memory-server replica set; binary and per-run data dir under `node_modules/.cache/mongodb-memory-server`, so a full system drive does not break the suite; override the data dir with `PHARMAOS_TEST_DBPATH`).
- `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- `pnpm --filter @pharmaos/web test:e2e` — Playwright browser tests in `apps/web/e2e`; they expect the api (:4000) and web (:3000) dev servers to be running and register a fresh organization per test. Covers the critical path, AI settings, marketing/SEO, responsive layout and axe accessibility.
- `node apps/web/scripts/capture-screenshots.mjs` — seeds a demo organization and refreshes the real product screenshots in `apps/web/public/screenshots` (dev servers must be running).
- `.claude/launch.json` also has `web-prod` (`next start` on :3010) for Lighthouse and production checks after `pnpm --filter @pharmaos/web build`.

## Non-negotiable rules
1. Money = integer minor units (paise); percentages = basis points. Use helpers in `packages/shared/src/money.ts`.
2. Quantities = integers in the product base unit. Unit factors convert for display only.
3. Tenant scoping: every query on an org-owned model goes through `orgFilter`/`outletFilter`/`findOrgDocOrThrow` in `apps/api/src/lib/scoped.ts`. `organizationId` comes from `req.ctx`, never from the request body.
4. `mongoose.set('sanitizeFilter', true)` is global. Server-built operator values (`$in`, `$ne`, `$gt`…) must be wrapped by `trustedFilter()` (orgFilter/outletFilter already do this). Forgetting it produces a loud CastError, not a silent wrong query.
5. Permissions live in `packages/shared/src/permissions.ts`; guard routes with `requirePermission`. Non-owners can only grant permissions they hold.
6. Money/stock documents: create inside `withTransaction`, reserve numbers with `nextDocumentNumber` in the same transaction, guard the endpoint with `idempotent({ required: true })`, and write `audit()` in the same session.
7. Historical documents snapshot prices/names/units; never recompute old invoices from current product data.
8. No fake UI: every sidebar module is backed by real API data. Do not add placeholder pages with dummy numbers; unfinished work is tracked in `docs/PHASES.md`.
9. Every list view has loading, empty and error states; every form maps server field errors via `applyServerErrors`.

## Public website & brand
- PharmaOS is a ChefoTech product. Brand/company config lives in `apps/web/src/lib/site.ts`; contact details, social links and the logo come from `NEXT_PUBLIC_*` env vars and are rendered only when set. Never hard-code contact information.
- Marketing pages live in `apps/web/src/app/(marketing)`; shared blocks in `components/marketing`; copy for FAQ and solution pages in `src/content`. Every page sets `title`, `description`, `alternates.canonical` and `...og(...)` from `lib/site.ts`. Descriptions ≤175 chars, titles ≤70 (enforced by `e2e/marketing.spec.ts`).
- Only describe features that exist; no superlatives or unverified claims ("No. 1", "guaranteed").
- Website forms post to `POST /api/v1/leads` (public, rate-limited). Analytics go through `lib/analytics.ts` `track()`; never send personal data in events.

## AI assistant (Gemini, optional)
- Backend: `apps/api/src/modules/ai/` (settings, tools, chat/extract service, routes at `/api/v1/ai`), provider abstraction in `apps/api/src/services/ai/`. Keys are sealed with `lib/secret-box.ts`; never log or return them.
- Adding an AI capability = adding a tool in `modules/ai/tools.ts` with a `permission` (and optional `feature`) that calls an existing service. Tools must not touch models directly and must return proposals (`actions`) for anything that changes money, stock or sends messages.
- Frontend: `features/ai/api.ts`, `stores/assistant.ts`, `components/ai/assistant.tsx` (`AiAssistant` mounted in the app shell, `AskAi`, `AiDashboardCard`). `PageHeader` shows a "What is this?" button automatically; pass `help="…"` for a better question or `help={false}` to hide it.
- Tests stub `GeminiProvider.prototype.generate/test` with `vi.spyOn`; no test calls Google.

## Adding a module (pattern)
`apps/api/src/modules/<name>/{<name>.service.ts,<name>.routes.ts}` → mount in `apps/api/src/app.ts` → schemas/types in `packages/shared/src/schemas` and `types/api.ts` → hooks in `apps/web/src/features/<name>/api.ts` → pages under `apps/web/src/app/(app)/`. Add tests in `apps/api/src/tests/` using `registerTenant`/`addMember` helpers.

## Frontend conventions
- Feature hooks live in `apps/web/src/features/<module>/api.ts`; pages compose them with the primitives in `apps/web/src/components/ui` (`DataTable`, `Combobox` + pickers, `MoneyInput` in paise, `PercentInput` in bps, `PaymentLines`, `TotalsPanel`, `CustomFieldsForm`, `DocumentActions`).
- Financial POSTs send an `Idempotency-Key` from `newIdempotencyKey()`; rotate it after a failed attempt (the API also releases keys on 4xx/5xx).
- Pages that read `useSearchParams` wrap their body in `<Suspense>`.
- `FormField` injects `id`/aria attributes into its child, including through a react-hook-form `Controller`.
- `react-hooks/set-state-in-effect` is a warning, not an error: dialogs legitimately reset local state when they open.

## Environment
`apps/api/.env` (git-ignored) holds the Atlas URI (non-SRV form because the local resolver refuses SRV; set `DNS_SERVERS=8.8.8.8` to use the `mongodb+srv://` form), Brevo key (console email provider is used when empty or in tests), Cloudinary keys, optional Firebase service account for future phone OTP.
