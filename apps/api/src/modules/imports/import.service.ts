import Papa from 'papaparse';
import { Types } from 'mongoose';
import { IMPORT_COLUMNS, toMinor, type CreateImportInput, type ImportEntity, type ImportJobDto, type ImportRowResult, GSTIN_REGEX } from '@pharmaos/shared';
import { ImportJobModel, type ImportJobDoc } from '@/models/import-job.model';
import { ProductModel, normalizeName, buildSearchTokens, type ProductDoc } from '@/models/product.model';
import { CategoryModel, type CategoryDoc } from '@/models/category.model';
import { UnitModel, type UnitDoc } from '@/models/unit.model';
import { CustomerModel, type CustomerDoc } from '@/models/customer.model';
import { SupplierModel, type SupplierDoc } from '@/models/supplier.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter } from '@/lib/scoped';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit } from '@/services/audit.service';
import { postLedgerEntry } from '@/services/ledger.service';
import { postOpeningStock } from '@/modules/inventory/inventory.service';
import { userRefs, iso, isoNow } from '@/modules/common/refs';

const MAX_ROWS = 5000;

type Row = Record<string, string>;

function toDto(doc: ImportJobDoc, who: (id: Types.ObjectId | null | undefined) => { id: string; name: string } | null, includeRows = true): ImportJobDto {
  return {
    id: String(doc._id),
    entity: doc.entity as ImportEntity,
    fileName: doc.fileName ?? '',
    status: doc.status as ImportJobDto['status'],
    duplicateStrategy: doc.duplicateStrategy as ImportJobDto['duplicateStrategy'],
    totalRows: doc.totalRows ?? 0,
    validRows: doc.validRows ?? 0,
    invalidRows: doc.invalidRows ?? 0,
    duplicateRows: doc.duplicateRows ?? 0,
    committedRows: doc.committedRows ?? 0,
    rows: includeRows ? (doc.rows as ImportRowResult[]).slice(0, 500) : [],
    error: doc.error ?? '',
    createdBy: who(doc.createdBy),
    createdAt: isoNow(doc.createdAt),
    committedAt: iso(doc.committedAt),
  };
}

/** Normalise header names: "Product Name" → "productname"; matched against template keys/labels. */
function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsv(csv: string, entity: ImportEntity, mapping?: Record<string, string>): { rows: Row[]; unknownHeaders: string[] } {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
  if (parsed.errors.length && parsed.data.length === 0) throw new ValidationError(`Could not parse CSV: ${parsed.errors[0]!.message}`);
  const columns = IMPORT_COLUMNS[entity];
  const keyByNorm = new Map<string, string>();
  for (const c of columns) {
    keyByNorm.set(normHeader(c.key), c.key);
    keyByNorm.set(normHeader(c.label), c.key);
  }
  const headers = parsed.meta.fields ?? [];
  const headerToKey = new Map<string, string>();
  const unknownHeaders: string[] = [];
  for (const h of headers) {
    const mapped = mapping?.[h] ?? keyByNorm.get(normHeader(h));
    if (mapped) headerToKey.set(h, mapped);
    else unknownHeaders.push(h);
  }
  const rows: Row[] = parsed.data.slice(0, MAX_ROWS).map((r) => {
    const out: Row = {};
    for (const [h, k] of headerToKey) out[k] = (r[h] ?? '').toString().trim();
    return out;
  });
  return { rows, unknownHeaders };
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v.replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const mmYYYY = /^(\d{1,2})[\/-](\d{4})$/.exec(v);
  if (mmYYYY) {
    const m = Number(mmYYYY[1]);
    const y = Number(mmYYYY[2]);
    return new Date(y, m, 0); // last day of month
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ---------------------------------------------------------------- validation per entity */

async function validateRows(ctx: RequestContext, entity: ImportEntity, rows: Row[], strategy: 'skip' | 'update' | 'fail'): Promise<ImportRowResult[]> {
  const columns = IMPORT_COLUMNS[entity];
  const results: ImportRowResult[] = [];
  const units = await UnitModel.find(orgFilter<UnitDoc>(ctx, { status: 'active' })).lean<UnitDoc[]>();
  const unitByName = new Map(units.flatMap((u) => [[u.nameNormalized, u], [u.abbreviation.toLowerCase(), u]] as [string, UnitDoc][]));
  const seenInFile = new Set<string>();

  const existingProducts = entity === 'products' || entity === 'openingStock' ? await ProductModel.find(orgFilter<ProductDoc>(ctx, { status: { $ne: 'archived' } })).select('name nameNormalized barcodes units baseUnitId pricingUnitId').lean<ProductDoc[]>() : [];
  const productByName = new Map(existingProducts.map((p) => [p.nameNormalized, p]));
  const productByBarcode = new Map(existingProducts.flatMap((p) => p.barcodes.map((b) => [b.code, p] as [string, ProductDoc])));
  const existingCustomers = entity === 'customers' ? await CustomerModel.find(orgFilter<CustomerDoc>(ctx, {})).select('phone').lean<CustomerDoc[]>() : [];
  const customerPhones = new Set(existingCustomers.map((c) => c.phone));
  const existingSuppliers = entity === 'suppliers' ? await SupplierModel.find(orgFilter<SupplierDoc>(ctx, {})).select('nameNormalized').lean<SupplierDoc[]>() : [];
  const supplierNames = new Set(existingSuppliers.map((s) => s.nameNormalized));

  rows.forEach((r, i) => {
    const errors: string[] = [];
    for (const c of columns) if (c.required && !r[c.key]) errors.push(`${c.label} is required`);
    const preview: Record<string, unknown> = { ...r };
    let duplicate = false;

    if (entity === 'products') {
      const base = r.baseUnit ? unitByName.get(r.baseUnit.toLowerCase()) : undefined;
      const pack = r.packUnit ? unitByName.get(r.packUnit.toLowerCase()) : undefined;
      if (r.baseUnit && !base) errors.push(`Unknown unit "${r.baseUnit}" (create it under Settings → Units first)`);
      if (r.packUnit && !pack) errors.push(`Unknown unit "${r.packUnit}"`);
      const packSize = num(r.packSize) ?? 1;
      if (r.packUnit && (!Number.isInteger(packSize) || packSize < 1)) errors.push('Pack size must be a whole number ≥ 1');
      const gst = num(r.gstRate);
      if (r.gstRate && (gst === null || gst < 0 || gst > 100)) errors.push('GST % must be between 0 and 100');
      for (const k of ['mrp', 'sellingPrice', 'purchasePrice'] as const) if (r[k] && num(r[k]) === null) errors.push(`${k} must be a number`);
      const key = normalizeName(r.name ?? '');
      if (key && (productByName.has(key) || seenInFile.has(key))) duplicate = true;
      if (r.barcode && productByBarcode.has(r.barcode) && productByBarcode.get(r.barcode)!.nameNormalized !== key) errors.push(`Barcode ${r.barcode} belongs to "${productByBarcode.get(r.barcode)!.name}"`);
      if (key) seenInFile.add(key);
      preview.baseUnitId = base ? String(base._id) : null;
      preview.packUnitId = pack ? String(pack._id) : null;
      preview.packSize = packSize;
    } else if (entity === 'customers') {
      if (r.phone && !/^\+?[0-9\s-]{7,15}$/.test(r.phone)) errors.push('Invalid phone');
      if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) errors.push('Invalid email');
      if (r.gstin && !GSTIN_REGEX.test(r.gstin.toUpperCase())) errors.push('Invalid GSTIN');
      if (r.phone && (customerPhones.has(r.phone) || seenInFile.has(r.phone))) duplicate = true;
      if (r.phone) seenInFile.add(r.phone);
    } else if (entity === 'suppliers') {
      if (r.gstin && !GSTIN_REGEX.test(r.gstin.toUpperCase())) errors.push('Invalid GSTIN');
      const key = normalizeName(r.name ?? '');
      if (key && (supplierNames.has(key) || seenInFile.has(key))) duplicate = true;
      if (key) seenInFile.add(key);
    } else if (entity === 'openingStock') {
      const product = r.product ? (productByBarcode.get(r.product) ?? productByName.get(normalizeName(r.product))) : undefined;
      if (r.product && !product) errors.push(`Product "${r.product}" not found (import products first)`);
      const qty = num(r.qty);
      if (r.qty && (qty === null || qty <= 0)) errors.push('Quantity must be positive');
      const exp = parseDate(r.expiryDate ?? '');
      if (r.expiryDate && !exp) errors.push('Invalid expiry date');
      if (exp && exp < new Date()) errors.push('Batch is already expired');
      for (const k of ['mrp', 'purchasePrice'] as const) if (r[k] && num(r[k]) === null) errors.push(`${k} must be a number`);
      if (product) {
        const unit = r.unit ? unitByName.get(r.unit.toLowerCase()) : units.find((u) => String(u._id) === String(product.pricingUnitId));
        if (!unit) errors.push(`Unknown unit "${r.unit}"`);
        else if (!product.units.some((u) => String(u.unitId) === String(unit._id))) errors.push(`Unit "${unit.name}" is not configured for ${product.name}`);
        preview.productId = String(product._id);
        preview.productName = product.name;
        preview.unitId = unit ? String(unit._id) : null;
      }
      preview.expiryDate = exp ? exp.toISOString() : null;
    }

    const status: ImportRowResult['status'] = errors.length ? 'invalid' : duplicate ? 'duplicate' : 'valid';
    if (status === 'duplicate' && strategy === 'fail') errors.push('Duplicate of an existing record');
    results.push({ row: i + 2, status: errors.length ? 'invalid' : status, errors, preview });
  });
  return results;
}

/* ---------------------------------------------------------------- jobs */

export async function createImport(ctx: RequestContext, input: CreateImportInput) {
  const { rows, unknownHeaders } = parseCsv(input.csv, input.entity, input.mapping);
  if (rows.length === 0) throw new ValidationError('The file has no data rows');
  const results = await validateRows(ctx, input.entity, rows, input.duplicateStrategy);
  const doc = await ImportJobModel.create({
    organizationId: ctx.organizationId,
    outletId: ctx.outletId ?? null,
    entity: input.entity,
    fileName: input.fileName,
    duplicateStrategy: input.duplicateStrategy,
    totalRows: results.length,
    validRows: results.filter((r) => r.status === 'valid').length,
    invalidRows: results.filter((r) => r.status === 'invalid').length,
    duplicateRows: results.filter((r) => r.status === 'duplicate').length,
    rows: results,
    createdBy: ctx.userId,
  });
  const who = await userRefs([ctx.userId]);
  return { ...toDto(doc.toObject() as ImportJobDoc, who), unknownHeaders };
}

export async function getImport(ctx: RequestContext, id: string) {
  const doc = await ImportJobModel.findOne(orgFilter<ImportJobDoc>(ctx, { _id: id })).lean<ImportJobDoc>();
  if (!doc) throw new NotFoundError('Import');
  const who = await userRefs([doc.createdBy]);
  return toDto(doc, who);
}

export async function listImports(ctx: RequestContext) {
  const docs = await ImportJobModel.find(orgFilter<ImportJobDoc>(ctx, {})).sort({ createdAt: -1 }).limit(50).select('-rows').lean<ImportJobDoc[]>();
  const who = await userRefs(docs.map((d) => d.createdBy));
  return docs.map((d) => toDto({ ...d, rows: [] }, who, false));
}

export async function discardImport(ctx: RequestContext, id: string) {
  const doc = await ImportJobModel.findOne(orgFilter<ImportJobDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Import');
  if (doc.status !== 'validated') throw new BusinessRuleError('Only validated (uncommitted) imports can be discarded');
  doc.status = 'discarded';
  doc.set('rows', []);
  await doc.save();
}

/**
 * Commits valid rows. Master-data imports run in one transaction (all-or-nothing). Opening stock
 * commits via the inventory service so every batch/movement is a normal, auditable posting.
 */
export async function commitImport(ctx: RequestContext, id: string) {
  const doc = await ImportJobModel.findOne(orgFilter<ImportJobDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Import');
  if (doc.status !== 'validated') throw new BusinessRuleError(`Import is ${doc.status}`);
  const rows = doc.rows as ImportRowResult[];
  const strategy = doc.duplicateStrategy as 'skip' | 'update' | 'fail';
  if (strategy === 'fail' && rows.some((r) => r.status === 'invalid' || r.status === 'duplicate')) throw new BusinessRuleError('Fix all invalid and duplicate rows before committing (strategy: fail)');
  const toCommit = rows.filter((r) => r.status === 'valid' || (r.status === 'duplicate' && strategy === 'update'));
  if (toCommit.length === 0) throw new BusinessRuleError('There are no rows to commit');

  doc.status = 'committing';
  await doc.save();
  try {
    let committed = 0;
    if (doc.entity === 'products') committed = await commitProducts(ctx, toCommit, strategy);
    else if (doc.entity === 'customers') committed = await commitCustomers(ctx, toCommit, strategy);
    else if (doc.entity === 'suppliers') committed = await commitSuppliers(ctx, toCommit, strategy);
    else if (doc.entity === 'openingStock') committed = await commitOpeningStock(ctx, toCommit);
    doc.status = 'committed';
    doc.committedRows = committed;
    doc.committedAt = new Date();
    doc.set('rows', rows.map((r) => ({ ...r, preview: {} })));
    await doc.save();
    await audit(ctx, { action: 'import.committed', entityType: 'ImportJob', entityId: doc._id, summary: `Imported ${committed} ${doc.entity} row(s) from ${doc.fileName}` });
  } catch (err) {
    doc.status = 'failed';
    doc.error = (err as Error).message.slice(0, 500);
    await doc.save();
    throw err;
  }
  const who = await userRefs([doc.createdBy]);
  return toDto(doc.toObject() as ImportJobDoc, who, false);
}

async function commitProducts(ctx: RequestContext, rows: ImportRowResult[], strategy: string): Promise<number> {
  const cats = await CategoryModel.find(orgFilter<CategoryDoc>(ctx, { status: 'active', parentId: null })).lean<CategoryDoc[]>();
  const catByName = new Map(cats.map((c) => [c.nameNormalized, c._id]));
  return withTransaction(async (session) => {
    let n = 0;
    for (const r of rows) {
      const p = r.preview as Record<string, string | number | null>;
      const name = String(p.name);
      let categoryId: Types.ObjectId | null = null;
      if (p.category) {
        const key = normalizeName(String(p.category));
        categoryId = catByName.get(key) ?? null;
        if (!categoryId) {
          const [c] = await CategoryModel.create([{ organizationId: ctx.organizationId, name: String(p.category), nameNormalized: key, path: String(p.category), createdBy: ctx.userId }], { session });
          categoryId = c!._id;
          catByName.set(key, categoryId);
        }
      }
      const baseUnitId = new Types.ObjectId(String(p.baseUnitId));
      const packUnitId = p.packUnitId ? new Types.ObjectId(String(p.packUnitId)) : baseUnitId;
      const packSize = Number(p.packSize ?? 1);
      const units = [{ unitId: baseUnitId, factorToBase: 1, isDefaultSale: packUnitId.equals(baseUnitId), isDefaultPurchase: packUnitId.equals(baseUnitId), allowLooseSale: true }];
      if (!packUnitId.equals(baseUnitId)) units.push({ unitId: packUnitId, factorToBase: packSize, isDefaultSale: true, isDefaultPurchase: true, allowLooseSale: true });
      const gst = p.gstRate !== null && p.gstRate !== undefined && p.gstRate !== '' ? Math.round(Number(String(p.gstRate).replace('%', '')) * 100) : 1200;
      const values = {
        name,
        nameNormalized: normalizeName(name),
        brandName: String(p.brandName ?? ''),
        genericName: String(p.genericName ?? ''),
        composition: String(p.composition ?? ''),
        manufacturer: String(p.manufacturer ?? ''),
        categoryId,
        dosageForm: String(p.dosageForm ?? 'other') || 'other',
        strength: String(p.strength ?? ''),
        packLabel: String(p.packLabel ?? ''),
        hsnCode: String(p.hsnCode ?? '').replace(/\D/g, ''),
        tax: { rateBps: gst, cessBps: 0 },
        schedule: String(p.schedule ?? 'none') || 'none',
        requiresPrescription: ['H', 'H1', 'X', 'narcotic'].includes(String(p.schedule ?? '')),
        baseUnitId,
        pricingUnitId: packUnitId,
        units,
        pricing: { mrpMinor: p.mrp ? toMinor(String(p.mrp).replace(/[,₹\s]/g, '')) : 0, sellingPriceMinor: p.sellingPrice ? toMinor(String(p.sellingPrice).replace(/[,₹\s]/g, '')) : p.mrp ? toMinor(String(p.mrp).replace(/[,₹\s]/g, '')) : 0, purchasePriceMinor: p.purchasePrice ? toMinor(String(p.purchasePrice).replace(/[,₹\s]/g, '')) : 0 },
        stockRules: { reorderLevelBase: Number(p.reorderLevel ?? 0) || 0, minStockBase: 0, maxStockBase: 0 },
        barcodes: p.barcode ? [{ code: String(p.barcode), isPrimary: true, source: 'manufacturer' as const }] : [],
        rackLocation: String(p.rackLocation ?? ''),
        searchTokens: buildSearchTokens(name, String(p.brandName ?? ''), String(p.genericName ?? ''), String(p.composition ?? ''), String(p.manufacturer ?? ''), String(p.barcode ?? '')),
      };
      if (r.status === 'duplicate' && strategy === 'update') {
        const { units: _u, baseUnitId: _b, pricingUnitId: _p, ...updatable } = values;
        await ProductModel.updateOne(orgFilter(ctx, { nameNormalized: values.nameNormalized }), { $set: { ...updatable, updatedBy: ctx.userId } }, { session });
      } else {
        await ProductModel.create([{ organizationId: ctx.organizationId, ...values, createdBy: ctx.userId }], { session });
      }
      n += 1;
    }
    return n;
  });
}

async function commitCustomers(ctx: RequestContext, rows: ImportRowResult[], strategy: string): Promise<number> {
  return withTransaction(async (session) => {
    let n = 0;
    for (const r of rows) {
      const p = r.preview as Record<string, string>;
      const values = {
        name: p.name,
        nameNormalized: normalizeName(p.name ?? ''),
        phone: p.phone,
        email: (p.email ?? '').toLowerCase(),
        address: { line1: p.address ?? '', city: p.city ?? '', pincode: p.pincode ?? '' },
        gstin: (p.gstin ?? '').toUpperCase(),
        creditLimitMinor: p.creditLimit ? toMinor(p.creditLimit.replace(/[,₹\s]/g, '')) : 0,
      };
      const opening = p.openingBalance ? toMinor(p.openingBalance.replace(/[,₹\s]/g, '')) : 0;
      if (r.status === 'duplicate' && strategy === 'update') {
        await CustomerModel.updateOne(orgFilter(ctx, { phone: p.phone }), { $set: { ...values, updatedBy: ctx.userId } }, { session });
      } else {
        const [c] = await CustomerModel.create([{ organizationId: ctx.organizationId, ...values, openingBalanceMinor: opening, createdBy: ctx.userId }], { session });
        if (opening) await postLedgerEntry(ctx, { partyType: 'customer', partyId: c!._id, type: 'opening', refType: 'Customer', refId: c!._id, debitMinor: opening > 0 ? opening : 0, creditMinor: opening < 0 ? -opening : 0, note: 'Opening balance (import)' }, session);
      }
      n += 1;
    }
    return n;
  });
}

async function commitSuppliers(ctx: RequestContext, rows: ImportRowResult[], strategy: string): Promise<number> {
  return withTransaction(async (session) => {
    let n = 0;
    for (const r of rows) {
      const p = r.preview as Record<string, string>;
      const values = {
        name: p.name,
        nameNormalized: normalizeName(p.name ?? ''),
        phone: p.phone ?? '',
        email: (p.email ?? '').toLowerCase(),
        contactPerson: p.contactPerson ?? '',
        gstin: (p.gstin ?? '').toUpperCase(),
        stateCode: p.stateCode ?? (p.gstin ? p.gstin.slice(0, 2) : ''),
        paymentTermsDays: Number(p.paymentTermsDays ?? 30) || 30,
      };
      const opening = p.openingBalance ? toMinor(p.openingBalance.replace(/[,₹\s]/g, '')) : 0;
      if (r.status === 'duplicate' && strategy === 'update') {
        await SupplierModel.updateOne(orgFilter(ctx, { nameNormalized: values.nameNormalized }), { $set: { ...values, updatedBy: ctx.userId } }, { session });
      } else {
        const [s] = await SupplierModel.create([{ organizationId: ctx.organizationId, ...values, openingBalanceMinor: opening, createdBy: ctx.userId }], { session });
        if (opening) await postLedgerEntry(ctx, { partyType: 'supplier', partyId: s!._id, type: 'opening', refType: 'Supplier', refId: s!._id, debitMinor: opening > 0 ? opening : 0, creditMinor: opening < 0 ? -opening : 0, note: 'Opening balance (import)' }, session);
      }
      n += 1;
    }
    return n;
  });
}

async function commitOpeningStock(ctx: RequestContext, rows: ImportRowResult[]): Promise<number> {
  const lines = rows.map((r) => {
    const p = r.preview as Record<string, string | number | null>;
    const money = (v: unknown) => toMinor(String(v ?? '0').replace(/[,₹\s]/g, ''));
    return {
      productId: String(p.productId),
      unitId: String(p.unitId),
      qty: Number(p.qty),
      batch: { batchNumber: String(p.batchNumber), expiryDate: new Date(String(p.expiryDate)), mrpMinor: money(p.mrp), sellingPriceMinor: p.sellingPrice ? money(p.sellingPrice) : money(p.mrp), purchasePriceMinor: money(p.purchasePrice) },
    };
  });
  // Chunk to keep transactions small.
  let n = 0;
  for (let i = 0; i < lines.length; i += 100) {
    const chunk = lines.slice(i, i + 100);
    const res = await postOpeningStock(ctx, { lines: chunk, notes: 'Imported opening stock' });
    n += res.lines;
  }
  return n;
}

export function templateCsv(entity: ImportEntity): string {
  const cols = IMPORT_COLUMNS[entity];
  return Papa.unparse({ fields: cols.map((c) => c.label), data: [cols.map((c) => c.example)] });
}
