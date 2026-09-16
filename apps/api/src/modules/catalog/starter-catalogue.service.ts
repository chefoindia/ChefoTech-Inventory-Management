import {
  STARTER_MEDICINES,
  starterMedicineByKey,
  type StarterCatalogueItem,
  type StarterMedicine,
  type AddStarterProductsResult,
  type CreateProductInput,
  type DrugSchedule,
} from '@pharmaos/shared';
import { ProductModel, normalizeName, buildSearchTokens } from '@/models/product.model';
import { UnitModel, type UnitDoc } from '@/models/unit.model';
import { OrganizationModel } from '@/models/organization.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, trustedFilter } from '@/lib/scoped';
import { BusinessRuleError, PlanLimitError } from '@/lib/errors';
import { audit } from '@/services/audit.service';
import { listUnits } from './units.service';

/** Products already in this organization, keyed by normalized name. */
async function existingNames(ctx: RequestContext): Promise<Set<string>> {
  const rows = await ProductModel.find(orgFilter(ctx, {})).select('nameNormalized').lean<{ nameNormalized: string }[]>();
  return new Set(rows.map((r) => r.nameNormalized));
}

/**
 * The catalogue with a flag for what the organization already stocks, so the screen can grey those
 * out instead of creating duplicates.
 */
export async function listStarterCatalogue(ctx: RequestContext): Promise<StarterCatalogueItem[]> {
  const have = await existingNames(ctx);
  return STARTER_MEDICINES.map((m) => ({ ...m, alreadyAdded: have.has(normalizeName(m.name)) }));
}

async function unitIdsByName(ctx: RequestContext): Promise<Map<string, string>> {
  // listUnits seeds the default units for organizations created before seeding existed.
  await listUnits(ctx);
  const units = await UnitModel.find(orgFilter<UnitDoc>(ctx, trustedFilter({ status: { $ne: 'archived' } }))).select('name').lean<{ _id: unknown; name: string }[]>();
  return new Map(units.map((u) => [u.name.toLowerCase(), String(u._id)]));
}

/** Builds the product payload for one catalogue entry; prices stay at zero on purpose. */
function toCreateInput(m: StarterMedicine, units: Map<string, string>): CreateProductInput {
  const baseId = units.get(m.baseUnit.toLowerCase());
  if (!baseId) throw new BusinessRuleError(`The unit "${m.baseUnit}" is missing from your units list. Add it in Settings → Categories & units and try again.`);
  const packId = m.packUnit ? units.get(m.packUnit.toLowerCase()) : undefined;
  const usePack = Boolean(packId) && m.packSize > 1;

  const productUnits = usePack
    ? [
        { unitId: baseId, factorToBase: 1, isDefaultPurchase: false, isDefaultSale: false, allowLooseSale: true },
        { unitId: packId!, factorToBase: m.packSize, isDefaultPurchase: true, isDefaultSale: true, allowLooseSale: true },
      ]
    : [{ unitId: baseId, factorToBase: 1, isDefaultPurchase: true, isDefaultSale: true, allowLooseSale: true }];

  return {
    name: m.name,
    brandName: m.brandName,
    genericName: m.genericName,
    composition: m.composition,
    manufacturer: m.manufacturer,
    categoryId: null,
    dosageForm: m.dosageForm as CreateProductInput['dosageForm'],
    strength: m.strength,
    packLabel: m.packLabel,
    hsnCode: m.hsnCode,
    tax: { rateBps: m.gstRateBps, cessBps: 0 },
    schedule: m.schedule as DrugSchedule,
    requiresPrescription: m.requiresPrescription,
    baseUnitId: baseId,
    units: productUnits,
    pricingUnitId: usePack ? packId! : baseId,
    // Prices belong to a batch: they arrive with the first purchase or opening stock.
    pricing: { mrpMinor: 0, sellingPriceMinor: 0, purchasePriceMinor: 0 },
    stockRules: { reorderLevelBase: 0, minStockBase: 0, maxStockBase: 0 },
    barcodes: [],
    rackLocation: '',
    tags: ['starter-catalogue'],
    notes: '',
    customFields: {},
  };
}

/**
 * Creates the chosen catalogue entries as products in one write.
 *
 * This deliberately does not loop through `createProduct`: an owner ticking fifty medicines would
 * otherwise wait through fifty round trips of limit checks, unit lookups and audit writes. The
 * catalogue is a controlled data set with no barcodes, categories or custom fields, so the checks
 * that matter (plan limit, units exist, no duplicate names) are done once for the whole batch and
 * the insert is a single statement, with one audit entry describing it.
 */
export async function addStarterProducts(ctx: RequestContext, keys: string[]): Promise<AddStarterProductsResult> {
  const chosen = keys.map((k) => starterMedicineByKey(k)).filter((m): m is StarterMedicine => !!m);
  if (!chosen.length) throw new BusinessRuleError('None of the selected medicines are in the starter catalogue.');

  const have = await existingNames(ctx);
  const units = await unitIdsByName(ctx);
  const result: AddStarterProductsResult = { added: 0, skipped: [], failed: [] };

  const fresh: StarterMedicine[] = [];
  for (const m of chosen) {
    const normalized = normalizeName(m.name);
    if (have.has(normalized)) {
      result.skipped.push(m.name);
      continue;
    }
    have.add(normalized);
    fresh.push(m);
  }
  if (!fresh.length) return result;

  const org = await OrganizationModel.findById(ctx.organizationId).select('subscription.limits').lean();
  const limit = org?.subscription?.limits?.products ?? 1000;
  const count = await ProductModel.countDocuments(orgFilter(ctx, trustedFilter({ status: { $ne: 'archived' } })));
  const room = Math.max(limit - count, 0);
  if (room <= 0) throw new PlanLimitError(`Your plan allows ${limit} products. Upgrade to add more.`);
  const fits = fresh.slice(0, room);
  for (const m of fresh.slice(room)) result.failed.push({ name: m.name, reason: `Your plan allows ${limit} products.` });

  const docs = fits.map((m) => {
    const input = toCreateInput(m, units);
    return {
      organizationId: ctx.organizationId,
      ...input,
      nameNormalized: normalizeName(input.name),
      searchTokens: buildSearchTokens(input.name, input.brandName, input.genericName, input.composition, input.manufacturer),
      customFields: {},
      createdBy: ctx.userId,
    };
  });

  const inserted = await ProductModel.insertMany(docs, { ordered: false });
  result.added = inserted.length;
  await audit(ctx, {
    action: 'product.created',
    entityType: 'Product',
    summary: `Added ${inserted.length} product${inserted.length === 1 ? '' : 's'} from the common medicines list`,
    after: { names: fits.map((m) => m.name) },
  });
  return result;
}
