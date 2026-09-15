import { z } from 'zod';
import { addressSchema, optionalEmailSchema, optionalPhoneSchema, optionalUrlSchema } from './common';
import { GSTIN_REGEX, GST_REGISTRATION_TYPES, INDIAN_STATE_CODES, PAN_REGEX } from '../constants/india';
import { DOCUMENT_TYPES } from '../constants/enums';

export const organizationTaxSchema = z.object({
  gstin: z.string().trim().toUpperCase().regex(GSTIN_REGEX, 'Invalid GSTIN').or(z.literal('')).optional(),
  pan: z.string().trim().toUpperCase().regex(PAN_REGEX, 'Invalid PAN').or(z.literal('')).optional(),
  stateCode: z.enum(INDIAN_STATE_CODES as [string, ...string[]]),
  registrationType: z.enum(GST_REGISTRATION_TYPES).default('regular'),
});

export const numberingRuleSchema = z.object({
  prefix: z.string().trim().max(10).regex(/^[A-Za-z0-9-]*$/, 'Letters, numbers, hyphen only'),
  padding: z.number().int().min(1).max(10),
  resetOnFinancialYear: z.boolean().default(false),
  perOutlet: z.boolean().default(true),
});

const salesSettings = z.object({
  maxDiscountBps: z.number().int().min(0).max(10_000).default(1000),
  requireCustomerForCredit: z.boolean().default(true),
  defaultCreditDays: z.number().int().min(0).max(365).default(30),
  roundOff: z.enum(['nearest', 'none']).default('nearest'),
  askEmailInvoice: z.boolean().default(true),
  cancelWindowHours: z.number().int().min(0).max(720).default(24),
});
const purchaseSettings = z.object({
  requireGrnForStock: z.boolean().default(true),
  autoUpdateSellingPriceFromPurchase: z.boolean().default(false),
});
const inventorySettings = z.object({
  expiryWarningDays: z.array(z.number().int().min(1).max(730)).min(1).max(5).default([30, 60, 90]),
  lowStockMode: z.enum(['reorderLevel', 'minStock']).default('reorderLevel'),
  blockNearExpirySaleDays: z.number().int().min(0).max(365).default(0),
  adjustmentApprovalThresholdMinor: z.number().int().min(0).default(500_000),
});
const taxSettings = z.object({
  engine: z.enum(['in-gst']).default('in-gst'),
  pricesIncludeTax: z.boolean().default(true),
});
const documentSettings = z.object({
  defaultPageSize: z.enum(['A4', 'A5', 'thermal80', 'thermal58']).default('A4'),
});

export const organizationSettingsSchema = z.object({
  sales: salesSettings.prefault({}),
  purchases: purchaseSettings.prefault({}),
  inventory: inventorySettings.prefault({}),
  tax: taxSettings.prefault({}),
  numbering: z.partialRecord(z.enum(DOCUMENT_TYPES), numberingRuleSchema).prefault({}),
  documents: documentSettings.prefault({}),
});
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;

/** Patch form: every nested key optional. Server merges with the stored settings. */
export const organizationSettingsPatchSchema = z.object({
  sales: salesSettings.partial().optional(),
  purchases: purchaseSettings.partial().optional(),
  inventory: inventorySettings.partial().optional(),
  tax: taxSettings.partial().optional(),
  numbering: z.partialRecord(z.enum(DOCUMENT_TYPES), numberingRuleSchema).optional(),
  documents: documentSettings.partial().optional(),
});
export type OrganizationSettingsPatch = z.infer<typeof organizationSettingsPatchSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(200).optional(),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  website: optionalUrlSchema,
  address: addressSchema.partial().optional(),
  tax: organizationTaxSchema.partial().optional(),
  financialYearStartMonth: z.number().int().min(1).max(12).optional(),
  timezone: z.string().max(64).optional(),
  settings: organizationSettingsPatchSchema.optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
