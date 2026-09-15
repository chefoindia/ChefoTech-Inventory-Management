# PharmaOS — Frontend Architecture & Design System

## Stack
Next.js (App Router, TypeScript), Tailwind CSS v4 with design tokens, Radix primitives, TanStack Query, react-hook-form + zod (schemas from `@pharmaos/shared`), Zustand for POS/session state, lucide-react icons.

## Route structure
```
src/app/
  (marketing)/            public site: /, /pricing, /features, /security
  (auth)/                 /login, /register, /invite/[token], /forgot-password
  (app)/                  authenticated shell (sidebar + topbar + outlet switcher)
    dashboard/
    sales/                pos/, invoices/, held/, returns/, payments/
    purchases/            list, new, grn/, returns/, payments/
    inventory/            products/, stock/, batches/, expiry/, low-stock/, adjustments/, transfers/, movements/
    customers/            list, [id]/
    suppliers/            list, [id]/
    prescriptions/
    reports/              [report]/
    notifications/
    settings/             organization, outlets, users, roles, products, sales, purchases, tax, notifications, templates, email, security, custom-fields
```

Pages are thin: they compose feature components from `src/features/<module>`.

## Data layer
- `src/lib/api-client.ts`: fetch wrapper adding bearer token, `X-Outlet-Id`, request id; on 401 performs a single silent refresh then retries; on repeated failure redirects to login.
- `src/features/<module>/api.ts`: typed query/mutation hooks with query keys `[module, 'list', filters]`, `[module, 'detail', id]`.
- Optimistic updates only for non-financial toggles. Financial mutations always refetch.

## Auth/session state
- Access token kept in memory (Zustand `session` store), refresh via cookie. `me` payload (user, org, membership, permissions, outlets) cached; `usePermission('sales.create')` and `<Can permission="…">` for conditional UI.
- Active outlet in store + `localStorage` (per user), sent on every request.

## Design tokens (Tailwind v4 `@theme`)
- Colour: neutral slate scale for surfaces, a restrained teal-green primary (`--color-primary-600: #0f766e`) that reads clinical and trustworthy, semantic `success/warning/danger/info`. No gradients in the app; one subtle gradient allowed on the marketing hero.
- Type: Inter (UI) with tabular numerals for money/qty columns; sizes 12/13/14/16/20/24/30.
- Spacing scale 4px; radius 6px (controls) / 10px (cards); shadow: `sm` for cards, `lg` for popovers only.
- Density: app tables use 36px rows; POS uses 32px rows.

## Base components (`src/components/ui`)
Button, IconButton, Input, NumberInput (integer/decimal aware), Textarea, Select, Combobox (async search + keyboard), Checkbox, Switch, RadioGroup, DatePicker, Badge, Card, Tabs, Dialog, ConfirmDialog, Drawer, DropdownMenu, Tooltip, Toast, Alert, DataTable (server pagination, sortable, column visibility, sticky header, row actions), Pagination, EmptyState, ErrorState, Skeleton, PageHeader, Stat, KeyValue, FormField (label+error+hint wired to react-hook-form), Money (formats minor units in org currency), Qty (formats base qty in display unit).

## Interaction rules
- Every list: loading skeleton, empty state with primary action, error state with retry.
- Every form: inline field errors, disabled submit while pending, toast on success, server errors mapped to fields where possible.
- Destructive/irreversible actions: ConfirmDialog with the consequence spelled out.
- Keyboard: `/` focuses global search, `F2` new sale, `F4` hold bill, `F8` payment, `Esc` closes overlays; POS grid supports arrow navigation and `Enter` to edit qty.
- Accessibility: all icon buttons have `aria-label`; focus rings visible; status never conveyed by colour alone (badge text/icon).

## Marketing site
Separate layout, premium typographic hero, feature sections tied to real modules, pricing *architecture* (plans read from config; no fabricated customer numbers), FAQ, CTA to register.
