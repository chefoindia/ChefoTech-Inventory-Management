# ADR-0001 — Foundational technology decisions

Status: accepted · Date: 2026-09-15

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Monorepo | pnpm workspaces (`apps/*`, `packages/*`) | Turborepo, Nx, separate repos | Shared zod schemas/permissions between API and web without publishing; pnpm is already installed; task runners can be added later. |
| HTTP framework | Express 5 | Fastify, NestJS | Express 5 has native async error propagation, the widest middleware ecosystem, and the simplest mental model for a large hand-written codebase. The bottleneck is MongoDB, not HTTP routing. NestJS adds DI ceremony without clear payoff here. |
| ODM | Mongoose 9 | Native driver, Prisma (Mongo) | Schema + index declarations in code, sessions/transactions, hooks. Typed with explicit interfaces. |
| Validation | zod 4 (shared package) | Joi, class-validator | Same schema validates API input and web forms; TypeScript inference. |
| Money | Integer minor units (paise) as JS numbers | Decimal128, floating point | Safe up to 2^53 (₹90 trillion); deterministic arithmetic; trivial aggregation in Mongo pipelines. Decimal128 complicates aggregation and drivers. |
| Quantities | Integer base units | Decimal quantities | Loose sales (tablets) become exact integer math; unit factors convert display units. Units that need decimals (ml, grams) define a base unit fine enough (e.g. 1 ml) to stay integer. |
| Percentages | Basis points (integer) | Decimal percent | Exact; 18% = 1800 bps; 0.5% = 50 bps. |
| Password hashing | Node `crypto.scrypt` | bcrypt, argon2 | No native build dependency (Windows-friendly), memory-hard, standard library. |
| Auth tokens | Short JWT access + rotating opaque refresh token in httpOnly cookie | Session cookies only, long-lived JWT | Stateless per-request auth with revocable sessions; theft detection via rotation reuse. |
| Permissions | Code catalog + per-role string arrays | Permission collection | Catalog must be versioned with code; roles reference keys. |
| Logging | pino | winston | Fast structured JSON; pino-http integration. |
| Tests | vitest + supertest + mongodb-memory-server (replica set) | jest | Fast TS-native runner; real Mongo semantics incl. transactions. |
| Frontend | Next.js App Router + Tailwind v4 + Radix primitives + TanStack Query | Vite SPA, MUI | Marketing site + app in one deployable with SSR for public pages; Radix for accessible primitives without a heavy UI kit; Query for server-state caching. |
| Files | Cloudinary signed direct uploads | Upload through API | Keeps binaries off the API; server still controls limits via signature and verifies after upload. |
| Email | Provider interface with Brevo adapter + console adapter | Direct SMTP | User has Brevo; interface allows swapping. |
| Events | In-process typed event bus | Message queue from day one | Simplicity now; emitter API is stable so a queue can be inserted later. |
| Tax | Pluggable `TaxEngine` interface, `in-gst` implementation first | Hard-coded GST | Enables international tax later. |
