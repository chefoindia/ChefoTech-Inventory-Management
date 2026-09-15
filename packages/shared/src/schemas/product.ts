import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './common';
import { ENTITY_STATUSES } from '../constants/enums';

export const DRUG_SCHEDULES = ['none', 'OTC', 'G', 'H', 'H1', 'X', 'C', 'C1', 'narcotic'] as const;
export type DrugSchedule = (typeof DRUG_SCHEDULES)[number];

export const DOSAGE_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'suspension',
  'injection',
  'drops',
  'cream',
  'ointment',
  'gel',
  'lotion',
  'powder',
  'inhaler',
  'spray',
  'sachet',
  'suppository',
  'patch',
  'solution',
  'device',
  'other',
] as const;

export const customFieldValuesSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), z.unknown()).default({});

/* ---------------------------------------------------------------- categories */

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: objectIdSchema.nullable().optional(),
  description: z.string().trim().max(300).optional().default(''),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export const updateCategorySchema = createCategorySchema.partial().extend({ status: z.enum(ENTITY_STATUSES).optional() });
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/* ---------------------------------------------------------------- units */

export const createUnitSchema = z.object({
  name: z.string().trim().min(1).max(40),
  abbreviation: z.string().trim().min(1).max(10),
  allowsDecimal: z.boolean().default(false),
});
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export const updateUnitSchema = createUnitSchema.partial().extend({ status: z.enum(ENTITY_STATUSES).optional() });

/* ---------------------------------------------------------------- products */

export const productUnitSchema = z.object({
  unitId: objectIdSchema,
  /** How many base units make one of this unit. Base unit itself has factor 1. */
  factorToBase: z.number().int().min(1).max(1_000_000),
  isDefaultPurchase: z.boolean().default(false),
  isDefaultSale: z.boolean().default(false),
  allowLooseSale: z.boolean().default(true),
});
export type ProductUnitInput = z.infer<typeof productUnitSchema>;

export const barcodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(48)
    .regex(/^[A-Za-z0-9\-_.]+$/, 'Barcode may contain letters, numbers, - _ .'),
  unitId: objectIdSchema.optional(),
  isPrimary: z.boolean().default(false),
  source: z.enum(['manufacturer', 'internal']).default('manufacturer'),
});

export const productTaxSchema = z.object({
  rateBps: z.number().int().min(0).max(10_000).default(1200),
  cessBps: z.number().int().min(0).max(10_000).default(0),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(160),
  brandName: z.string().trim().max(120).optional().default(''),
  genericName: z.string().trim().max(160).optional().default(''),
  composition: z.string().trim().max(400).optional().default(''),
  manufacturer: z.string().trim().max(120).optional().default(''),
  categoryId: objectIdSchema.nullable().optional(),
  dosageForm: z.enum(DOSAGE_FORMS).optional().default('other'),
  strength: z.string().trim().max(60).optional().default(''),
  packLabel: z.string().trim().max(40).optional().default(''),
  hsnCode: z.string().trim().max(10).regex(/^[0-9]*$/, 'Digits only').optional().default(''),
  tax: productTaxSchema.default({ rateBps: 1200, cessBps: 0 }),
  schedule: z.enum(DRUG_SCHEDULES).default('none'),
  requiresPrescription: z.boolean().default(false),
  baseUnitId: objectIdSchema,
  units: z.array(productUnitSchema).min(1).max(8),
  /** Unit in which MRP / prices are quoted (usually strip or bottle). Must be one of `units`. */
  pricingUnitId: objectIdSchema,
  pricing: z
    .object({
      mrpMinor: z.number().int().min(0).default(0),
      sellingPriceMinor: z.number().int().min(0).default(0),
      purchasePriceMinor: z.number().int().min(0).default(0),
    })
    .default({ mrpMinor: 0, sellingPriceMinor: 0, purchasePriceMinor: 0 }),
  stockRules: z
    .object({
      reorderLevelBase: z.number().int().min(0).default(0),
      minStockBase: z.number().int().min(0).default(0),
      maxStockBase: z.number().int().min(0).default(0),
    })
    .default({ reorderLevelBase: 0, minStockBase: 0, maxStockBase: 0 }),
  barcodes: z.array(barcodeSchema).max(10).default([]),
  rackLocation: z.string().trim().max(60).optional().default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  notes: z.string().trim().max(1000).optional().default(''),
  customFields: customFieldValuesSchema,
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({ status: z.enum(ENTITY_STATUSES).optional() });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productListQuerySchema = paginationQuerySchema.extend({
  categoryId: objectIdSchema.optional(),
  status: z.enum(ENTITY_STATUSES).optional(),
  schedule: z.enum(DRUG_SCHEDULES).optional(),
  requiresPrescription: z.coerce.boolean().optional(),
  manufacturer: z.string().trim().max(120).optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(15),
  /** When set, include per-batch stock at this outlet (POS mode). */
  withStock: z.coerce.boolean().default(false),
});
