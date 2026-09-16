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
   PDFs use the core WinAnsi fonts, which have no rupee glyph: printed amounts go through `formatMoneyPlain` (no symbol) and every string through `pdfSafeText`. Use `formatMoney` (with ₹) only for screens, emails and notifications.
8. No fake UI: every sidebar module is backed by real API data. Do not add placeholder pages with dummy numbers; unfinished work is tracked in `docs/PHASES.md`.
9. Every list view has loading, empty and error states; every form maps server field errors via `applyServerErrors`.

## Public website & brand
- PharmaOS is a ChefoTech product. Brand/company config lives in `apps/web/src/lib/site.ts`: the real ChefoTech contact details (person, phones, WhatsApp, inboxes, two Bhubaneswar offices) and the emblem `/brand/chefotech.svg` are the defaults there, and every item can be overridden or hidden (empty string) with `NEXT_PUBLIC_*` env vars. Contact details are only ever edited in `site.ts` or env; never type them anywhere else and never invent new ones.
- Marketing illustrations are our own SVGs in `components/marketing/illustrations.tsx` (brand palette), not stock photos. `BarcodeSection` describes scanning exactly as shipped: keyboard-wedge scanners, barcode lookup with search fallback, several barcodes per product tied to units, label printing. Batch/expiry are not read from barcodes; do not claim it.
- Marketing pages live in `apps/web/src/app/(marketing)`; shared blocks in `components/marketing`; copy for FAQ and solution pages in `src/content`. Every page sets `title`, `description`, `alternates.canonical` and `...og(...)` from `lib/site.ts`. Descriptions ≤175 chars, titles ≤70 (enforced by `e2e/marketing.spec.ts`).
- Only describe features that exist; no superlatives or unverified claims ("No. 1", "guaranteed").
- Website forms post to `POST /api/v1/leads` (public, rate-limited). Analytics go through `lib/analytics.ts` `track()`; never send personal data in events.

## AI assistant (Gemini, optional)
- Backend: `apps/api/src/modules/ai/` (settings, tools, chat/extract service, routes at `/api/v1/ai`), provider abstraction in `apps/api/src/services/ai/`. Keys are sealed with `lib/secret-box.ts`; never log or return them.
- Adding an AI capability = adding a tool in `modules/ai/tools.ts` with a `permission` (and optional `feature`) that calls an existing service. Tools must not touch models directly and must return proposals (`actions`) for anything that changes money, stock or sends messages.
- Frontend: `features/ai/api.ts`, `stores/assistant.ts`, `components/ai/assistant.tsx` (`AiAssistant` mounted in the app shell, `AskAi`, `AiDashboardCard`). `PageHeader` shows a "What is this?" button automatically; pass `help="…"` for a better question or `help={false}` to hide it.
- Model ids are a preference, not a constant: Google renames and retires them, and a model can still appear in ListModels while being closed to new users (`404 … no longer available to new users … use models/X`). On a 404 the provider takes Google's named replacement, else `pickClosestModel()` over the key's catalogue, retries, and the chat service persists the substitute. Defaults are the maintained `*-latest` aliases, which are never retired. Never hard-code a dated model id.
- Gemini 3 and later attach an opaque `thoughtSignature` to each function call. It must be echoed back on the same part in the next turn or the API returns 400 ("missing a thought_signature"). `AiFunctionCall` carries it and `toGeminiContents` re-attaches it; never strip it when rebuilding history.
- Tests stub `GeminiProvider.prototype.generate/test` with `vi.spyOn`; no test calls Google.

## Starter catalogue (common medicines)
- `packages/shared/src/catalogue/starter-medicines.ts` holds ~100 curated Indian brands (composition, maker, pack, units, GST, schedule) so a new pharmacy can fill its product list in one click at `/products/starter`.
- Entries carry NO prices: MRP and cost belong to a batch and arrive with the first purchase or opening stock. Never add invented prices to this file, and keep the on-screen caveat that pack size, GST and schedule must be checked against the pack.
- `modules/catalog/starter-catalogue.service.ts` inserts the batch in one write (checked once for plan limit, units and duplicate names) rather than looping `createProduct`, which would be ~50 round trips.

## Adding a module (pattern)
`apps/api/src/modules/<name>/{<name>.service.ts,<name>.routes.ts}` → mount in `apps/api/src/app.ts` → schemas/types in `packages/shared/src/schemas` and `types/api.ts` → hooks in `apps/web/src/features/<name>/api.ts` → pages under `apps/web/src/app/(app)/`. Add tests in `apps/api/src/tests/` using `registerTenant`/`addMember` helpers.

## Frontend conventions
- Feature hooks live in `apps/web/src/features/<module>/api.ts`; pages compose them with the primitives in `apps/web/src/components/ui` (`DataTable`, `Combobox` + pickers, `MoneyInput` in paise, `PercentInput` in bps, `PaymentLines`, `TotalsPanel`, `CustomFieldsForm`, `DocumentActions`).
- Financial POSTs send an `Idempotency-Key` from `newIdempotencyKey()`; rotate it after a failed attempt (the API also releases keys on 4xx/5xx).
- Pages that read `useSearchParams` wrap their body in `<Suspense>`.
- `FormField` injects `id`/aria attributes into its child, including through a react-hook-form `Controller`.
- Every field carries an `info` explanation rendered as an info button beside the label (`components/ui/info-hint.tsx`); line tables use `ColumnHint` on the header instead of one button per row. Write the explanation in plain words: what the field is for, where it shows up, and an example. The button sits BESIDE the label, never inside it, or it becomes part of the field's accessible name.
- Because the button is named `What is "X" for?`, a non-anchored `getByLabel('X')` matches it too. In tests use `getByRole('textbox', { name: 'X' })` or an anchored regex.
- `react-hooks/set-state-in-effect` is a warning, not an error: dialogs legitimately reset local state when they open.

## Environment
`apps/api/.env` (git-ignored) holds the Atlas URI (non-SRV form because the local resolver refuses SRV; set `DNS_SERVERS=8.8.8.8` to use the `mongodb+srv://` form), Brevo key (console email provider is used when empty or in tests), Cloudinary keys, optional Firebase service account for future phone OTP.
