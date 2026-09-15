import { Types } from 'mongoose';
import type { CreateProductInput, UpdateProductInput, ProductDto, ProductListQuery, ProductSearchHit, ProductUnitDto, AttachmentRef } from '@pharmaos/shared';
import { ProductModel, normalizeName, buildSearchTokens, type ProductDoc } from '@/models/product.model';
import { UnitModel, type UnitDoc } from '@/models/unit.model';
import { CategoryModel, type CategoryDoc } from '@/models/category.model';
import type { RequestContext } from '@/lib/context';
import { hasPermission } from '@/lib/context';
import { orgFilter, findOrgDocOrThrow, trustedFilter } from '@/lib/scoped';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { pageOptions, pageMeta, escapeRegex } from '@/lib/pagination';
import { audit, diffObjects } from '@/services/audit.service';
import { validateCustomFields } from '@/modules/custom-fields/custom-fields.service';
import { getStockByProducts } from '@/modules/inventory/stock.service';
import { OrganizationModel } from '@/models/organization.model';
import { PlanLimitError } from '@/lib/errors';

type UnitMap = Map<string, Pick<UnitDoc, '_id' | 'name' | 'abbreviation' | 'allowsDecimal'>>;

async function loadUnitMap(ctx: RequestContext): Promise<UnitMap> {
  const units = await UnitModel.find(orgFilter<UnitDoc>(ctx, {})).select('name abbreviation allowsDecimal').lean<UnitDoc[]>();
  return new Map(units.map((u) => [String(u._id), u]));
}

function unitsDto(p: ProductDoc, unitMap: UnitMap): ProductUnitDto[] {
  return (p.units ?? []).map((u) => {
    const unit = unitMap.get(String(u.unitId));
    return {
      unitId: String(u.unitId),
      unitName: unit?.name ?? '',
      abbreviation: unit?.abbreviation ?? '',
      factorToBase: u.factorToBase,
      isDefaultPurchase: u.isDefaultPurchase ?? false,
      isDefaultSale: u.isDefaultSale ?? false,
      allowLooseSale: u.allowLooseSale ?? true,
    };
  });
}

export function toProductDto(p: ProductDoc, unitMap: UnitMap, ctx: RequestContext, extra: { categoryName?: string; stockBase?: number } = {}): ProductDto {
  const showCost = hasPermission(ctx, 'products.viewCost');
  return {
    id: String(p._id),
    name: p.name,
    brandName: p.brandName ?? '',
    genericName: p.genericName ?? '',
    composition: p.composition ?? '',
    manufacturer: p.manufacturer ?? '',
    categoryId: p.categoryId ? String(p.categoryId) : null,
    categoryName: extra.categoryName,
    dosageForm: p.dosageForm ?? 'other',
    strength: p.strength ?? '',
    packLabel: p.packLabel ?? '',
    hsnCode: p.hsnCode ?? '',
    tax: { rateBps: p.tax?.rateBps ?? 0, cessBps: p.tax?.cessBps ?? 0 },
    schedule: (p.schedule ?? 'none') as ProductDto['schedule'],
    requiresPrescription: p.requiresPrescription ?? false,
    baseUnitId: String(p.baseUnitId),
    pricingUnitId: String(p.pricingUnitId),
    units: unitsDto(p, unitMap),
    pricing: {
      mrpMinor: p.pricing?.mrpMinor ?? 0,
      sellingPriceMinor: p.pricing?.sellingPriceMinor ?? 0,
      ...(showCost ? { purchasePriceMinor: p.pricing?.purchasePriceMinor ?? 0 } : {}),
    },
    stockRules: {
      reorderLevelBase: p.stockRules?.reorderLevelBase ?? 0,
      minStockBase: p.stockRules?.minStockBase ?? 0,
      maxStockBase: p.stockRules?.maxStockBase ?? 0,
    },
    barcodes: (p.barcodes ?? []).map((b) => ({ code: b.code, unitId: b.unitId ? String(b.unitId) : undefined, isPrimary: b.isPrimary ?? false, source: (b.source ?? 'manufacturer') as 'manufacturer' | 'internal' })),
    rackLocation: p.rackLocation ?? '',
    images: (p.images ?? []) as AttachmentRef[],
    documents: (p.documents ?? []) as AttachmentRef[],
    tags: p.tags ?? [],
    notes: p.notes ?? '',
    customFields: (p.customFields as Record<string, unknown>) ?? {},
    status: (p.status ?? 'active') as ProductDto['status'],
    stockBase: extra.stockBase,
    createdAt: p.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: p.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

/** Validates the unit configuration: base unit present with factor 1, pricing unit present, single defaults, known units. */
async function validateUnits(ctx: RequestContext, input: Pick<CreateProductInput, 'baseUnitId' | 'units' | 'pricingUnitId'>) {
  const ids = [...new Set(input.units.map((u) => u.unitId))];
  if (ids.length !== input.units.length) throw new ValidationError('Each unit can appear only once', [{ path: 'body.units', message: 'Duplicate unit' }]);
  const known = await UnitModel.countDocuments(orgFilter(ctx, { _id: { $in: ids }, status: 'active' }));
  if (known !== ids.length) throw new NotFoundError('Unit');
  const base = input.units.find((u) => u.unitId === input.baseUnitId);
  if (!base) throw new ValidationError('The base unit must be included in the units list', [{ path: 'body.baseUnitId', message: 'Not in units' }]);
  if (base.factorToBase !== 1) throw new ValidationError('The base unit must have a factor of 1', [{ path: 'body.units', message: 'Base unit factor must be 1' }]);
  if (!input.units.some((u) => u.unitId === input.pricingUnitId)) throw new ValidationError('The pricing unit must be one of the product units', [{ path: 'body.pricingUnitId', message: 'Not in units' }]);
  if (input.units.filter((u) => u.isDefaultSale).length > 1) throw new ValidationError('Only one unit can be the default sale unit', [{ path: 'body.units', message: 'Multiple default sale units' }]);
  if (input.units.filter((u) => u.isDefaultPurchase).length > 1) throw new ValidationError('Only one unit can be the default purchase unit', [{ path: 'body.units', message: 'Multiple default purchase units' }]);
}

async function assertBarcodesFree(ctx: RequestContext, codes: string[], excludeId?: Types.ObjectId) {
  if (!codes.length) return;
  const lower = codes.map((c) => c.trim());
  if (new Set(lower).size !== lower.length) throw new ValidationError('Duplicate barcode on the same product', [{ path: 'body.barcodes', message: 'Duplicate' }]);
  const clash = await ProductModel.findOne(orgFilter<ProductDoc>(ctx, { 'barcodes.code': { $in: lower }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }))
    .select('name barcodes')
    .lean<ProductDoc>();
  if (clash) {
    const code = clash.barcodes.find((b) => lower.includes(b.code))?.code;
    throw new ConflictError(`Barcode ${code} is already assigned to "${clash.name}"`, [{ path: 'barcodes', message: `Used by ${clash.name}` }]);
  }
}

export async function listProducts(ctx: RequestContext, query: ProductListQuery) {
  const filter = orgFilter<ProductDoc>(ctx, {
    ...(query.status ? { status: query.status } : { status: { $ne: 'archived' } }),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.schedule ? { schedule: query.schedule } : {}),
    ...(query.requiresPrescription !== undefined ? { requiresPrescription: query.requiresPrescription } : {}),
    ...(query.manufacturer ? { manufacturer: query.manufacturer } : {}),
    ...(query.q ? { searchTokens: { $regex: `^${escapeRegex(normalizeName(query.q).split(' ')[0] ?? '')}` } } : {}),
  });
  const { skip, limit, sort } = pageOptions(query, ['name', 'createdAt', 'updatedAt', 'manufacturer'], { nameNormalized: 1 });
  const [products, total, unitMap] = await Promise.all([
    ProductModel.find(filter).sort(sort).skip(skip).limit(limit).lean<ProductDoc[]>(),
    ProductModel.countDocuments(filter),
    loadUnitMap(ctx),
  ]);
  const catIds = [...new Set(products.map((p) => p.categoryId).filter(Boolean).map(String))];
  const cats = await CategoryModel.find(trustedFilter({ _id: { $in: catIds } })).select('name').lean<Pick<CategoryDoc, '_id' | 'name'>[]>();
  const catMap = new Map(cats.map((c) => [String(c._id), c.name]));
  const stock = ctx.outletId && hasPermission(ctx, 'inventory.view') ? await getStockByProducts(ctx, products.map((p) => p._id)) : null;
  return {
    items: products.map((p) => toProductDto(p, unitMap, ctx, { categoryName: catMap.get(String(p.categoryId)), stockBase: stock?.get(String(p._id))?.stockBase })),
    meta: pageMeta(query, total),
  };
}

export async function getProduct(ctx: RequestContext, id: string) {
  const product = await findOrgDocOrThrow(ProductModel, ctx, id, 'Product');
  const unitMap = await loadUnitMap(ctx);
  const cat = product.categoryId ? await CategoryModel.findById(product.categoryId).select('name').lean<Pick<CategoryDoc, 'name'>>() : null;
  const stock = ctx.outletId && hasPermission(ctx, 'inventory.view') ? await getStockByProducts(ctx, [product._id]) : null;
  return toProductDto(product.toObject() as ProductDoc, unitMap, ctx, { categoryName: cat?.name, stockBase: stock?.get(String(product._id))?.stockBase });
}

export async function createProduct(ctx: RequestContext, input: CreateProductInput) {
  const org = await OrganizationModel.findById(ctx.organizationId).select('subscription.limits').lean();
  const limit = org?.subscription?.limits?.products ?? 1000;
  const count = await ProductModel.countDocuments(orgFilter(ctx, { status: { $ne: 'archived' } }));
  if (count >= limit) throw new PlanLimitError(`Your plan allows ${limit} products. Upgrade to add more.`);

  await validateUnits(ctx, input);
  if (input.categoryId) {
    const cat = await CategoryModel.exists(orgFilter(ctx, { _id: input.categoryId, status: 'active' }));
    if (!cat) throw new NotFoundError('Category');
  }
  await assertBarcodesFree(ctx, input.barcodes.map((b) => b.code));
  const customFields = await validateCustomFields(ctx, 'product', input.customFields);
  if (!hasPermission(ctx, 'products.viewCost')) input.pricing.purchasePriceMinor = 0;

  const product = await ProductModel.create({
    organizationId: ctx.organizationId,
    ...input,
    nameNormalized: normalizeName(input.name),
    searchTokens: buildSearchTokens(input.name, input.brandName, input.genericName, input.composition, input.manufacturer, ...input.barcodes.map((b) => b.code)),
    customFields,
    createdBy: ctx.userId,
  });
  await audit(ctx, { action: 'product.created', entityType: 'Product', entityId: product._id, summary: `Created product "${product.name}"`, after: { name: input.name, units: input.units, pricing: input.pricing, tax: input.tax } });
  return getProduct(ctx, String(product._id));
}

export async function updateProduct(ctx: RequestContext, id: string, input: UpdateProductInput) {
  const product = await findOrgDocOrThrow(ProductModel, ctx, id, 'Product');
  const before = product.toObject() as ProductDoc;

  const unitInput = { baseUnitId: input.baseUnitId ?? String(product.baseUnitId), pricingUnitId: input.pricingUnitId ?? String(product.pricingUnitId), units: input.units ?? (product.units as unknown as CreateProductInput['units']).map((u) => ({ ...u, unitId: String(u.unitId) })) };
  if (input.units || input.baseUnitId || input.pricingUnitId) {
    await validateUnits(ctx, unitInput);
    if (product.hasMovements) {
      // Unit factors are immutable once stock has moved; adding new units is fine, changing existing factors or the base unit is not.
      if (unitInput.baseUnitId !== String(product.baseUnitId)) throw new BusinessRuleError('The base unit cannot change once stock movements exist');
      for (const existing of product.units) {
        const next = unitInput.units.find((u) => u.unitId === String(existing.unitId));
        if (!next) throw new BusinessRuleError('Units cannot be removed once stock movements exist');
        if (next.factorToBase !== existing.factorToBase) throw new BusinessRuleError('Unit conversion factors cannot change once stock movements exist');
      }
    }
  }
  if (input.categoryId) {
    const cat = await CategoryModel.exists(orgFilter(ctx, { _id: input.categoryId, status: 'active' }));
    if (!cat) throw new NotFoundError('Category');
  }
  if (input.barcodes) await assertBarcodesFree(ctx, input.barcodes.map((b) => b.code), product._id);
  if (input.pricing && !hasPermission(ctx, 'products.managePricing') && (input.pricing.mrpMinor !== undefined || input.pricing.sellingPriceMinor !== undefined)) {
    throw new BusinessRuleError('You do not have permission to change prices');
  }
  const customFields = input.customFields !== undefined ? await validateCustomFields(ctx, 'product', input.customFields, { partial: true }) : undefined;

  const { pricing, customFields: _cf, ...rest } = input;
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) product.set(k, v);
  if (pricing) {
    const merged = { ...before.pricing, ...pricing };
    if (!hasPermission(ctx, 'products.viewCost')) merged.purchasePriceMinor = before.pricing?.purchasePriceMinor ?? 0;
    product.set('pricing', merged);
  }
  if (customFields) product.set('customFields', customFields);
  product.nameNormalized = normalizeName(product.name);
  product.searchTokens = buildSearchTokens(product.name, product.brandName ?? '', product.genericName ?? '', product.composition ?? '', product.manufacturer ?? '', ...product.barcodes.map((b) => b.code));
  product.updatedBy = ctx.userId;
  await product.save();

  const after = product.toObject() as ProductDoc;
  const priceChanged = JSON.stringify(before.pricing) !== JSON.stringify(after.pricing);
  await audit(ctx, {
    action: priceChanged ? 'product.priceChanged' : 'product.updated',
    entityType: 'Product',
    entityId: product._id,
    summary: `${priceChanged ? 'Changed prices of' : 'Updated'} product "${product.name}"`,
    ...diffObjects(
      { name: before.name, pricing: before.pricing, tax: before.tax, units: before.units, barcodes: before.barcodes, status: before.status, schedule: before.schedule },
      { name: after.name, pricing: after.pricing, tax: after.tax, units: after.units, barcodes: after.barcodes, status: after.status, schedule: after.schedule },
    ),
  });
  return getProduct(ctx, id);
}

export async function archiveProduct(ctx: RequestContext, id: string) {
  const product = await findOrgDocOrThrow(ProductModel, ctx, id, 'Product');
  product.status = 'archived';
  product.updatedBy = ctx.userId;
  await product.save();
  await audit(ctx, { action: 'product.archived', entityType: 'Product', entityId: product._id, summary: `Archived product "${product.name}"` });
}

export async function addAttachment(ctx: RequestContext, id: string, kind: 'images' | 'documents', ref: AttachmentRef) {
  const product = await findOrgDocOrThrow(ProductModel, ctx, id, 'Product');
  const list = product.get(kind) as AttachmentRef[];
  if (list.length >= 10) throw new BusinessRuleError('Maximum 10 files per product');
  list.push(ref);
  product.set(kind, list);
  await product.save();
  return getProduct(ctx, id);
}

export async function removeAttachment(ctx: RequestContext, id: string, kind: 'images' | 'documents', publicId: string) {
  const product = await findOrgDocOrThrow(ProductModel, ctx, id, 'Product');
  product.set(kind, (product.get(kind) as AttachmentRef[]).filter((a) => a.publicId !== publicId));
  await product.save();
  return getProduct(ctx, id);
}

/**
 * POS / purchase search. Matches word prefixes over name, brand, generic, composition,
 * manufacturer and exact barcodes. With `withStock` the result includes sellable batches at the
 * active outlet (FEFO order).
 */
export async function searchProducts(ctx: RequestContext, q: string, limit: number, withStock: boolean): Promise<ProductSearchHit[]> {
  const norm = normalizeName(q);
  const words = norm.split(' ').filter(Boolean);
  const [unitMap, byBarcode] = await Promise.all([
    loadUnitMap(ctx),
    ProductModel.find(orgFilter<ProductDoc>(ctx, { 'barcodes.code': q.trim(), status: 'active' })).limit(3).lean<ProductDoc[]>(),
  ]);
  const seen = new Set(byBarcode.map((p) => String(p._id)));
  let hits: ProductDoc[] = [...byBarcode];
  if (hits.length < limit && words.length) {
    const filter = orgFilter<ProductDoc>(ctx, {
      status: 'active',
      $and: words.map((w) => ({ searchTokens: { $regex: `^${escapeRegex(w)}` } })),
      ...(seen.size ? { _id: { $nin: [...seen] } } : {}),
    });
    const more = await ProductModel.find(filter).sort({ nameNormalized: 1 }).limit(limit - hits.length).lean<ProductDoc[]>();
    hits = hits.concat(more);
  }
  const stock = withStock && ctx.outletId ? await getStockByProducts(ctx, hits.map((p) => p._id), { withBatches: true }) : null;
  const showCost = hasPermission(ctx, 'products.viewCost');
  return hits.map((p) => {
    const s = stock?.get(String(p._id));
    return {
      id: String(p._id),
      name: p.name,
      brandName: p.brandName ?? '',
      genericName: p.genericName ?? '',
      composition: p.composition ?? '',
      manufacturer: p.manufacturer ?? '',
      packLabel: p.packLabel ?? '',
      schedule: (p.schedule ?? 'none') as ProductSearchHit['schedule'],
      requiresPrescription: p.requiresPrescription ?? false,
      tax: { rateBps: p.tax?.rateBps ?? 0, cessBps: p.tax?.cessBps ?? 0 },
      hsnCode: p.hsnCode ?? '',
      baseUnitId: String(p.baseUnitId),
      pricingUnitId: String(p.pricingUnitId),
      units: unitsDto(p, unitMap),
      pricing: { mrpMinor: p.pricing?.mrpMinor ?? 0, sellingPriceMinor: p.pricing?.sellingPriceMinor ?? 0 },
      barcodes: (p.barcodes ?? []).map((b) => ({ code: b.code, unitId: b.unitId ? String(b.unitId) : undefined, isPrimary: b.isPrimary ?? false, source: (b.source ?? 'manufacturer') as 'manufacturer' | 'internal' })),
      stockBase: s?.stockBase,
      batches: s?.batches?.map((b) => (showCost ? b : { ...b, purchasePriceMinor: undefined })),
    };
  });
}

export async function findByBarcode(ctx: RequestContext, code: string) {
  const hits = await searchProducts(ctx, code, 1, Boolean(ctx.outletId));
  const exact = hits.find((h) => h.barcodes.some((b) => b.code === code.trim()));
  if (!exact) throw new NotFoundError('Product with this barcode');
  return exact;
}

/** Generates an internal EAN-13 style barcode with a valid check digit; prefix 2 = in-store use. */
export async function generateInternalBarcode(ctx: RequestContext, id: string, unitId?: string) {
  const product = await findOrgDocOrThrow(ProductModel, ctx, id, 'Product');
  let code = '';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const body = '2' + String(Date.now() % 1_000_000_000_000).padStart(11, '0').slice(-11);
    const check = ean13CheckDigit(body);
    code = body + check;
    const exists = await ProductModel.exists(orgFilter(ctx, { 'barcodes.code': code }));
    if (!exists) break;
    code = '';
  }
  if (!code) throw new BusinessRuleError('Could not generate a unique barcode, try again');
  product.barcodes.push({ code, unitId: unitId ? new Types.ObjectId(unitId) : null, isPrimary: product.barcodes.length === 0, source: 'internal' });
  product.searchTokens = buildSearchTokens(product.name, product.brandName ?? '', product.genericName ?? '', product.composition ?? '', product.manufacturer ?? '', ...product.barcodes.map((b) => b.code));
  await product.save();
  await audit(ctx, { action: 'product.barcodeGenerated', entityType: 'Product', entityId: product._id, summary: `Generated barcode ${code} for "${product.name}"` });
  return getProduct(ctx, id);
}

export function ean13CheckDigit(body12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}
