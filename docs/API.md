# PharmaOS — API Design

Base URL: `/api/v1`. JSON only. All timestamps ISO-8601 UTC. Money as integer minor units. Quantities as integers in base units unless a `unitId` is supplied with the request.

## Conventions

| Concern | Rule |
|---|---|
| Auth | `Authorization: Bearer <accessToken>` (15 min JWT). Refresh via httpOnly cookie `pharmaos_rt` on `POST /auth/refresh`. |
| Active outlet | `X-Outlet-Id: <outletId>` header on outlet-scoped endpoints. Verified against membership. |
| Idempotency | `Idempotency-Key: <uuid>` on POST endpoints that create financial or inventory documents. Replays return the stored response. |
| Pagination | `?page=1&pageSize=25&sort=-createdAt` → `meta: { page, pageSize, total, totalPages }`. `pageSize` max 100. |
| Filtering | Whitelisted per endpoint; `?q=` for search; date ranges `?from=&to=`. |
| Errors | `{ success:false, error:{ code, message, details? }, requestId }`. Codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `BUSINESS_RULE`, `RATE_LIMITED`, `INTERNAL`. |
| Versioning | URL prefix `/v1`. Breaking changes → `/v2`. |

## Phase 0 endpoints (implemented)

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Creates User + Organization + default Outlet + system roles + owner Membership. Returns tokens. |
| POST | `/auth/login` | Email + password. Account lockout after repeated failures. Returns access token + sets refresh cookie. |
| POST | `/auth/refresh` | Rotates refresh token; detects reuse and revokes the session family. |
| POST | `/auth/logout` | Revokes current session. |
| POST | `/auth/switch-organization` | Issues tokens for another organization the user belongs to. |
| GET | `/auth/me` | User, active organization, membership, role permissions, accessible outlets. |
| GET | `/auth/sessions` / DELETE `/auth/sessions/:id` | Session management. |
| POST | `/auth/change-password` | Requires current password; revokes other sessions. |

### Organization
| GET/PATCH | `/organization` | Profile, tax details, settings (`organization.manage`). |

### Outlets
| GET | `/outlets` | Outlets the caller can access. |
| POST | `/outlets` | `outlets.manage`; enforces plan outlet limit. |
| GET/PATCH | `/outlets/:id` | |
| POST | `/outlets/:id/archive` | |

### Users & Roles
| GET | `/users` | Members of the organization with role + outlet access. |
| POST | `/users/invite` | Creates Invitation (email delivery in Phase 1). |
| PATCH | `/users/:membershipId` | Change role / outlet access / status. |
| GET | `/roles` , POST `/roles`, PATCH `/roles/:id`, DELETE `/roles/:id` | Custom roles; system roles read-only except permission tweaks on non-owner roles. |
| GET | `/roles/permissions` | Permission catalog grouped by module. |

### Audit
| GET | `/audit-logs` | Filter by entity, user, action, date. |

## Later phases (designed)

- Products: `/products`, `/products/search?q=`, `/products/by-barcode/:code`, `/products/:id/barcodes`, `/categories`, `/units`
- Suppliers/Customers: `/suppliers`, `/suppliers/:id/ledger`, `/customers`, `/customers/:id/ledger`, `/customers/:id/payments`
- Inventory: `/inventory/stock`, `/inventory/batches`, `/inventory/movements`, `/inventory/adjustments`, `/inventory/expiry`, `/inventory/low-stock`, `/inventory/opening-stock`
- Purchases: `/purchases`, `/purchases/:id/confirm`, `/grns`, `/grns/:id/confirm`, `/purchase-returns`, `/supplier-payments`
- Sales: `/sales` (POST creates completed invoice atomically), `/sales/hold`, `/sales/:id/cancel`, `/sales/:id/pdf`, `/sales/:id/email`, `/sales-returns`, `/customer-payments`
- Transfers: `/transfers`, `/transfers/:id/approve|dispatch|receive`
- Prescriptions: `/prescriptions`, `/prescriptions/:id/files/:fileId/url` (signed, short-lived)
- Documents: `/templates`, `/templates/:id/versions`, `/templates/:id/preview`, `/documents/:type/:refId/render`
- Reports: `/reports/<name>?from&to&outletId&format=json|csv|xlsx|pdf`
- Dashboard: `/dashboard/summary`, `/dashboard/trends`
- Notifications: `/notifications`, `/notifications/:id/read`, `/notification-rules`
- Custom fields: `/custom-fields/:entity`
- Attachments: `/attachments/sign-upload`, `/attachments/:id/url`
- Import: `/imports` (upload → validate/preview → commit)
- Subscription: `/subscription`, `/subscription/usage`
