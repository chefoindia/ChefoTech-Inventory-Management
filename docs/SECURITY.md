# PharmaOS — Security Design

## Authentication
- Passwords hashed with Node `crypto.scrypt` (N=2^15, r=8, p=1, 32-byte salt, 64-byte key), constant-time compare. Parameters encoded in the hash string so they can be raised later.
- Access token: JWT (HS256, 15 min) carrying `sub`, `org`, `mem` (membership id), `sid` (session id). No permissions in the token: permissions are loaded per request from the role (so role edits apply immediately) and cached in-process for 30 s.
- Refresh token: 256-bit random, stored **hashed** (SHA-256) in `Session`, delivered as an httpOnly, `SameSite=Strict`, `Secure` (prod) cookie scoped to `/api/v1/auth`. Rotation on every refresh; reuse of a rotated token revokes the whole session (token-theft detection).
- Login lockout: 5 failures → 15 min lock (per user). Rate limit on `/auth/*` per IP.
- Password policy: min 10 chars; checked against a small list of very common passwords.

## Authorization (RBAC)
- Permission catalog is code (`packages/shared/src/permissions.ts`), grouped by module. Roles store permission keys.
- `requirePermission('sales.create')` middleware; owner membership bypasses. Multiple permissions can be required with `all`/`any` semantics.
- Outlet scoping: `X-Outlet-Id` must be in the membership's `outletAccess`. Outlet-scoped services always filter by `ctx.outletId`.
- Sensitive read permissions: `products.viewCost`, `reports.viewProfit` — cost fields are stripped in serializers when absent.
- Frontend hides UI by permission for UX only; the API is the enforcement point.

## Tenant isolation
- `organizationId` is derived from the token's membership, never from the request body.
- `scoped(Model, ctx)` helper builds queries with `organizationId` (+ `outletId` for outlet models). Services use it exclusively.
- Cross-tenant references (e.g. `customerId` in a sale) are validated to belong to the same organization before use (`assertSameOrg`).
- Integration tests assert that org A cannot read or mutate org B records via any endpoint (`tenant-isolation.test.ts`).

## Input validation & injection
- zod validation of body/query/params on every route; unknown keys stripped.
- Mongo operator injection blocked: request bodies are sanitised (keys starting with `$` or containing `.` rejected) and all queries are built from validated values.
- Custom fields: keys must match `^[a-z][a-z0-9_]{1,40}$`; values validated against the definition type; stored under a dedicated map, never merged into the document root.

## Transport & headers
- `helmet` defaults + strict CSP on the API (JSON only), `X-Content-Type-Options`, no `X-Powered-By`.
- CORS allowlist from env; credentials allowed only for the web origin.
- Rate limiting: global per IP + stricter buckets for auth and PDF/email endpoints.
- Request body limit 1 MB (uploads go directly to Cloudinary via signed parameters, never through the API).

## Files
- Client asks `/attachments/sign-upload` with intended use; API validates type/size limits and returns a signed Cloudinary upload signature restricted to a folder, resource type, allowed formats and max bytes.
- After upload the client submits the public id; the API verifies the asset via Cloudinary Admin API (type, bytes, format) before storing metadata.
- Prescriptions and customer/supplier documents are uploaded as `type: 'private'`/`authenticated`; access is through short-lived signed URLs after a permission check. Public assets: logos, product images.

## Secrets & config
- All secrets via environment variables validated at boot; `.env.example` documents them; `.env` git-ignored.
- Logs redact `password`, `authorization`, `cookie`, `token`, `refreshToken`.
- Organization Gemini API keys: validated with a live call before saving, sealed with AES-256-GCM (`lib/secret-box.ts`; key derived from `AI_ENCRYPTION_KEY`, falling back to the JWT secret), stored only in `AiSettings.sealedApiKey`, exposed to clients only as the last four characters, never written to browser storage, and only ever decrypted inside the API process for the outgoing Gemini request. Removing the key disables AI for the organization.
- AI tool calls run under the requesting user's context: every tool declares the permission it needs and is filtered out of the model's tool list when the user lacks it; tools use the existing service layer (tenant/outlet scoped), never raw database access; anything that moves money, stock or sends messages only returns a proposal that the user confirms through the normal endpoints.

## Audit
- Every security-relevant and financial action writes an `AuditLog` entry with actor, org, outlet, action, entity, before/after (diffed), IP, user agent, request id.

## Financial safety
- Money integers; server recomputes every total from line items and rejects mismatches.
- Transactions for sale/GRN/return/transfer/payment. Idempotency keys prevent duplicate submission on retry.
- Stock decrement uses conditional updates (`qtyBase >= needed`) inside the transaction: concurrent sales cannot oversell.

## Threat checklist (reviewed each phase)
IDOR · privilege escalation via role edit · outlet hopping · expired-token replay · refresh reuse · brute force · mass assignment · operator injection · unsafe file types · public private docs · PDF SSRF via template images · CSV formula injection on export (cells starting with `= + - @` are prefixed) · timing leaks on login · enumeration on register/forgot-password (uniform responses).

## Phase 10 security review (2026-09-16)

Checked against the master spec's security section; each item names where it is enforced.

- Authentication: scrypt password hashing, short-lived access JWT + rotating refresh cookie (`httpOnly`, `sameSite`, `secure` in production), session revocation (`apps/api/src/modules/auth`).
- Tenant isolation: every org-owned query goes through `orgFilter`/`outletFilter`; `sanitizeFilter` is global with `trustedFilter` for server-built operators; covered by `tenant-isolation.test.ts` and the share-link ownership test in `phase10.test.ts`.
- Authorization: `requirePermission` on every route; owner bypass; non-owners cannot grant permissions they lack (`rbac.test.ts`).
- Input validation: zod on params/query/body for every route; custom-field values validated against their definitions; CSV imports validated row by row before commit.
- Rate limiting: global limiter plus `heavyRateLimit` on PDF, export, email and share-link endpoints; auth endpoints have their own limiter.
- Headers: helmet (`middleware/security.ts`); CORS restricted to `WEB_ORIGIN`.
- Payments: Razorpay orders are created server-side; checkout success is verified with HMAC-SHA256 over `order_id|payment_id`; webhooks are verified over the raw body with a constant-time compare; plan activation is idempotent per invoice.
- Public links: share tokens are signed JWTs carrying only a document reference, expire in 7 days, can only be minted for records the caller's organization owns, and render through the same tenant-scoped data providers.
- Uploads: signed Cloudinary uploads with purpose-specific folders, formats and size limits; private resources (prescriptions, documents) are served through short-lived signed URLs, never public links.
- Idempotency: required on every financial/stock POST; keys are per organization and released on failure so a corrected retry is not rejected.
- Secrets: only environment variables (`apps/api/.env`, git-ignored); `.env.example` documents every key; no credentials in source.
- Error handling: a central handler maps known errors to safe messages and codes; stack traces never reach clients.
- Dependencies: `pnpm audit --prod` reports no known vulnerabilities (transitive `uuid` pinned to >=11.1.1 via a pnpm override).
- Audit trail: logins, failed logins, permission changes, plan changes, checkouts, document emails and share links are all recorded.

Open before public launch: rotate every credential that was ever pasted into chat, run a third-party penetration test, and turn on Atlas backups with point-in-time restore.
