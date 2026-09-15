# PharmaOS — Data Model (MongoDB)

## Conventions

- **Money**: integer **minor units** (paise for INR). Field names end in `Minor` where ambiguity is possible (e.g. `unitPriceMinor`). Never `Number` with decimals for money. Percentages stored as basis points (`discountBps`, `taxRateBps`; 1800 = 18.00%).
- **Quantities**: integers in the product's **base unit** (smallest sellable unit, e.g. tablet). Display units (strip, box) are derived through `ProductUnit` conversion factors. Field: `qtyBase`.
- **Tenancy**: every tenant document has `organizationId` (indexed first in every compound index). Outlet-scoped documents also have `outletId`.
- **Timestamps**: `createdAt`, `updatedAt` (Mongoose). Mutating documents also carry `createdBy`, `updatedBy` (User ids).
- **Soft delete**: master data uses `status: 'active' | 'inactive' | 'archived'` rather than physical deletion. Financial documents are never deleted; they are `cancelled` or reversed.
- **Snapshots**: transaction line items snapshot product name, unit, batch number, expiry, prices, tax rate at the time of the transaction. Later product edits never change history.
- **Custom fields**: `customFields: { [key]: value }` map on supporting entities; validated against `CustomFieldDefinition` server-side.

## Platform / Identity

### Organization
```
name, slug (unique), legalName?, logo?: Attachment, address, phone, email, website?,
tax: { gstin?, pan?, stateCode?, registrationType: 'regular'|'composition'|'unregistered' },
currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata',
financialYearStartMonth: 4,
settings: OrganizationSettings (embedded; see Settings section),
subscription: { planKey, status, trialEndsAt?, limits: { outlets, users, products, storageMb } },
status: 'active'|'suspended', createdBy
```
Indexes: `{ slug: 1 } unique`.

### Outlet
```
organizationId, name, code (unique per org), type: 'retail'|'warehouse',
address, phone, email, gstin?, stateCode, drugLicenseNo?, drugLicenseExpiry?,
businessHours?, settings: OutletSettings (invoice numbering, printer defaults, tax overrides),
isDefault, status
```
Indexes: `{ organizationId: 1, code: 1 } unique`, `{ organizationId: 1, status: 1 }`.

### User
```
email (unique, lowercase), passwordHash (scrypt), name, phone?, avatar?: Attachment,
emailVerifiedAt?, lastLoginAt?, status: 'active'|'disabled',
security: { failedLoginAttempts, lockedUntil?, passwordChangedAt }
```
Indexes: `{ email: 1 } unique`.

### Membership
```
userId, organizationId, roleId, outletAccess: { all: boolean, outletIds: ObjectId[] },
defaultOutletId?, isOwner, status: 'active'|'invited'|'suspended',
invitedBy?, invitedAt?, joinedAt?
```
Indexes: `{ userId: 1, organizationId: 1 } unique`, `{ organizationId: 1, status: 1 }`.

### Invitation
```
organizationId, email, roleId, outletAccess, token (hashed), expiresAt, acceptedAt?, invitedBy
```
Indexes: `{ tokenHash: 1 } unique`, `{ organizationId: 1, email: 1 }`.

### Role
```
organizationId, key (e.g. 'owner','pharmacist','custom-xyz'), name, description,
permissions: string[], isSystem, status
```
Indexes: `{ organizationId: 1, key: 1 } unique`.
System roles are seeded per organization at creation (Owner, Org Admin, Outlet Manager, Pharmacist, Billing Staff, Inventory Manager, Purchase Manager, Accountant). Owner is not editable.

### Session (refresh tokens)
```
userId, organizationId, tokenHash, userAgent, ip, expiresAt, revokedAt?, replacedBy?
```
Indexes: `{ tokenHash: 1 } unique`, `{ userId: 1 }`, TTL on `expiresAt`.

### AuditLog
```
organizationId, outletId?, userId?, action (e.g. 'sale.create'), entityType, entityId?,
summary, before?, after?, metadata?, ip?, userAgent?, requestId, createdAt
```
Indexes: `{ organizationId: 1, createdAt: -1 }`, `{ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 }`, `{ organizationId: 1, userId: 1, createdAt: -1 }`.

### IdempotencyKey
```
organizationId, key, method, path, requestHash, statusCode, responseBody, createdAt (TTL 24h)
```
Indexes: `{ organizationId: 1, key: 1 } unique`, TTL.

### DocumentSequence
```
organizationId, outletId?, documentType ('sale','purchase','grn','salesReturn','purchaseReturn','payment','receipt','transfer','adjustment'),
prefix, padding, next, fyKey? ('2026-27'), resetOnFinancialYear
```
Indexes: `{ organizationId: 1, outletId: 1, documentType: 1, fyKey: 1 } unique`.

## Master Data

### Category
`organizationId, name, parentId?, path, status` — Indexes `{ organizationId: 1, parentId: 1, name: 1 } unique`.

### Unit
`organizationId, name ('Tablet'), abbreviation ('tab'), allowsDecimal, isSystem` — `{ organizationId: 1, name: 1 } unique`.

### Product
```
organizationId, name, nameNormalized, brandName?, genericName?, composition?, manufacturer?,
categoryId?, subcategoryId?, dosageForm?, strength?, packSize?, packLabel? ('1x10'),
barcodes: [{ code, unitId, isPrimary, source: 'manufacturer'|'internal' }],
hsnCode?, tax: { rateBps, cess?Bps, inclusive: boolean },
schedule: 'none'|'H'|'H1'|'X'|'G'|'OTC'|..., requiresPrescription,
baseUnitId, units: [ { unitId, factorToBase, isDefaultPurchase, isDefaultSale, allowLooseSale } ],
pricing: { mrpMinor?, sellingPriceMinor?, purchasePriceMinor? }   // defaults for new batches; batch values take precedence
stock: { reorderLevelBase, minStockBase, maxStockBase },
rackLocation?, images: Attachment[], documents: Attachment[],
searchTokens: string[], customFields, tags, status, notes, createdBy, updatedBy
```
Indexes: `{ organizationId: 1, nameNormalized: 1 }`, `{ organizationId: 1, 'barcodes.code': 1 } unique sparse`, `{ organizationId: 1, searchTokens: 1 }`, `{ organizationId: 1, categoryId: 1 }`, `{ organizationId: 1, status: 1, updatedAt: -1 }`, text index on `(name, brandName, genericName, composition, manufacturer)`.

### Supplier
```
organizationId, name, code?, contactPerson?, phone, email?, address, gstin?, stateCode?, pan?,
paymentTermsDays, openingBalanceMinor, balanceMinor (denormalized payable), documents, customFields, status
```
Indexes: `{ organizationId: 1, name: 1 }`, `{ organizationId: 1, phone: 1 }`, `{ organizationId: 1, gstin: 1 } sparse`.

### Customer
```
organizationId, name, phone, email?, address?, gstin?, stateCode?, dateOfBirth?,
creditLimitMinor, openingBalanceMinor, balanceMinor (denormalized receivable),
defaultDiscountBps?, tags, documents, customFields, status, notes
```
Indexes: `{ organizationId: 1, phone: 1 }`, `{ organizationId: 1, name: 1 }`, `{ organizationId: 1, balanceMinor: -1 }`.

### CustomFieldDefinition
```
organizationId, entity ('product'|'customer'|'supplier'|'user'|'sale'|'purchase'), key, label, type,
required, defaultValue?, options?: [{label,value}], validation?: { min?, max?, pattern?, maxLength? },
visibility: { list, form, print }, sortOrder, status
```
Indexes: `{ organizationId: 1, entity: 1, key: 1 } unique`.

### Attachment (embedded subdocument type, and standalone collection for orphan tracking)
```
provider: 'cloudinary', publicId, resourceType, format, bytes, width?, height?, originalName,
access: 'public'|'private', uploadedBy, uploadedAt
```

## Inventory

### ProductBatch
```
organizationId, productId, batchNumber, mfgDate?, expiryDate, mrpMinor, sellingPriceMinor, purchasePriceMinor,
supplierId?, sourceType ('grn'|'opening'|'transfer'|'adjustment'), sourceId?, status ('active'|'blocked'|'expired')
```
Indexes: `{ organizationId: 1, productId: 1, batchNumber: 1, mrpMinor: 1 } unique`, `{ organizationId: 1, expiryDate: 1 }`.

### Stock (per outlet per batch)
```
organizationId, outletId, productId, batchId, qtyBase, reservedBase, expiryDate (denormalized), updatedAt
```
Indexes: `{ organizationId: 1, outletId: 1, batchId: 1 } unique`, `{ organizationId: 1, outletId: 1, productId: 1, expiryDate: 1 }` (FEFO), `{ organizationId: 1, outletId: 1, qtyBase: 1 }`.

### InventoryMovement (append-only ledger)
```
organizationId, outletId, productId, batchId, qtyBaseDelta (+/-), balanceAfterBase,
reason ('opening'|'grn'|'sale'|'sales_return'|'purchase_return'|'transfer_out'|'transfer_in'|'adjustment'|'damage'|'expiry'|'reconciliation'),
refType, refId, refNumber, unitCostMinor, note?, userId, createdAt
```
Indexes: `{ organizationId: 1, outletId: 1, productId: 1, createdAt: -1 }`, `{ organizationId: 1, refType: 1, refId: 1 }`, `{ organizationId: 1, createdAt: -1 }`.

### StockAdjustment
```
organizationId, outletId, number, type, reason, status ('draft'|'pending_approval'|'approved'|'rejected'),
items: [{ productId, batchId, qtyBaseDelta, unitCostMinor, note }], requestedBy, approvedBy?, approvedAt?, notes, attachments
```

### StockTransfer
```
organizationId, number, fromOutletId, toOutletId, status ('draft'|'requested'|'approved'|'dispatched'|'in_transit'|'received'|'partially_received'|'cancelled'),
items: [{ productId, batchId, qtyRequestedBase, qtyDispatchedBase, qtyReceivedBase, discrepancyNote }],
requestedBy, approvedBy?, dispatchedBy?, receivedBy?, timestamps per stage, notes
```

## Purchases

### Purchase (supplier invoice)
```
organizationId, outletId, number, supplierId, supplierInvoiceNumber, invoiceDate, dueDate?,
status ('draft'|'confirmed'|'partially_received'|'received'|'cancelled'),
items: [{ productId, unitId, factorToBase, qty, freeQty, qtyBase, batch: {batchNumber, mfgDate, expiryDate}, purchasePriceMinor, mrpMinor, sellingPriceMinor,
          discountBps, discountMinor, schemeNote, taxRateBps, taxableMinor, taxMinor, totalMinor }],
totals: { subtotalMinor, discountMinor, taxableMinor, cgstMinor, sgstMinor, igstMinor, otherChargesMinor, roundOffMinor, grandTotalMinor },
paidMinor, balanceMinor, placeOfSupplyStateCode, attachments, notes, createdBy
```
Indexes: `{ organizationId: 1, outletId: 1, number: 1 } unique`, `{ organizationId: 1, supplierId: 1, invoiceDate: -1 }`, `{ organizationId: 1, supplierId: 1, supplierInvoiceNumber: 1 }`.

### GRN
```
organizationId, outletId, number, purchaseId, supplierId, receivedDate, status ('draft'|'confirmed'),
items: [{ purchaseItemIndex, productId, batchId?, batch {…}, orderedBase, receivedBase, freeBase, shortBase, damagedBase, purchasePriceMinor, mrpMinor }],
receivedBy, attachments, notes
```
Confirming a GRN creates/updates `ProductBatch`, upserts `Stock`, appends `InventoryMovement(reason='grn')`.

### PurchaseReturn, SupplierPayment, SupplierLedgerEntry
Ledger entries are append-only: `{ organizationId, supplierId, type ('purchase'|'payment'|'return'|'opening'|'adjustment'), refType, refId, refNumber, debitMinor, creditMinor, balanceAfterMinor, date, note }`.

## Sales

### Sale
```
organizationId, outletId, number, type ('invoice'|'draft'|'held'), status ('draft'|'held'|'completed'|'cancelled'),
customerId?, customerSnapshot {name, phone, gstin?, stateCode?}, prescriptionIds?,
items: [{ productId, productSnapshot {name, hsn, schedule}, batchId, batchSnapshot {batchNumber, expiryDate, mrpMinor},
          unitId, unitSnapshot {name, factorToBase}, qty, qtyBase, unitPriceMinor, mrpMinor,
          discountBps, discountMinor, taxRateBps, taxableMinor, cgstMinor, sgstMinor, igstMinor, totalMinor, costMinor }],
billDiscount: { type: 'percent'|'fixed', value, amountMinor },
totals: { subtotalMinor, itemDiscountMinor, billDiscountMinor, taxableMinor, cgstMinor, sgstMinor, igstMinor, roundOffMinor, grandTotalMinor, costMinor },
payments: [{ method, amountMinor, reference?, receivedAt }], paidMinor, creditMinor, balanceMinor, dueDate?,
placeOfSupplyStateCode, isInterState, soldBy, cancelledBy?, cancelReason?, notes, idempotencyKey
```
Indexes: `{ organizationId: 1, outletId: 1, number: 1 } unique`, `{ organizationId: 1, outletId: 1, createdAt: -1 }`, `{ organizationId: 1, customerId: 1, createdAt: -1 }`, `{ organizationId: 1, status: 1, balanceMinor: 1 }`.

### SalesReturn, CustomerPayment, CustomerLedgerEntry
Same ledger pattern as supplier side. `CustomerPayment` can allocate to multiple invoices: `allocations: [{ saleId, amountMinor }]`.

## Pharmacy

### Prescription
```
organizationId, customerId, doctorName, doctorRegNo?, hospital?, prescriptionDate, validUntil?,
files: Attachment[] (access: 'private'), notes, linkedSaleIds, status
```

## Documents & Notifications

### PdfTemplate / PdfTemplateVersion
```
PdfTemplate: organizationId, outletId?, documentType, name, isDefault, currentVersionId, status
PdfTemplateVersion: templateId, version, pageSize, orientation, margins, elements: JSON (designer model), createdBy
```

### GeneratedDocument
`organizationId, documentType, refId, templateVersionId, attachment, generatedAt, emailedTo?: [{ email, status, providerMessageId?, error? }]`

### Notification
`organizationId, outletId?, userId? (null = broadcast to permission holders), type, title, body, severity, entityType?, entityId?, readAt?, createdAt` — `{ organizationId: 1, userId: 1, readAt: 1, createdAt: -1 }`.

### NotificationRule
`organizationId, type, enabled, thresholds, channels: ['inApp','email',...], recipients: { roles, users }`.

## Settings (embedded in Organization / Outlet)

```
OrganizationSettings {
  sales: { allowNegativeStock: false (hard), allowSaleOfExpired: false (hard), maxDiscountBps, requireCustomerForCredit, defaultCreditDays, roundOff: 'nearest'|'none' },
  purchases: { requireGrnForStock: true, autoUpdateSellingPriceFromPurchase },
  inventory: { expiryWarningDays: [30, 60, 90], lowStockMode: 'reorderLevel'|'minStock', blockNearExpirySaleDays? },
  tax: { engine: 'in-gst', pricesIncludeTax: true },
  numbering: { [documentType]: { prefix, padding, resetOnFinancialYear, perOutlet } },
  notifications: {...}, email: { fromName, fromEmail, provider }, documents: { defaultPageSize }
}
```

## Subscription (Phase 9)
`Plan { key, name, priceMinor, interval, limits, features[] }`, `Subscription { organizationId, planKey, status, periodStart, periodEnd, trialEndsAt }`, `UsageCounter { organizationId, metric, value, period }`.
