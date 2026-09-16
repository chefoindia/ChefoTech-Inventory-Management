import { z } from 'zod';
import { addressSchema, optionalEmailSchema, optionalPhoneSchema } from './common';
import { GSTIN_REGEX, INDIAN_STATE_CODES } from '../constants/india';
import { OUTLET_TYPES } from '../constants/enums';

export const outletSettingsSchema = z.object({
  invoiceFooterNote: z.string().trim().max(500).optional().default(''),
  defaultPrinter: z.enum(['a4', 'thermal80', 'thermal58']).default('a4'),
  autoPrintOnSale: z.boolean().default(false),
  /** Free-form opening hours shown on documents, e.g. "Mon–Sat 9:00–21:00". */
  businessHours: z.string().trim().max(120).optional().default(''),
});

export const createOutletSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,10}$/, '2-10 letters, numbers or hyphens'),
  type: z.enum(OUTLET_TYPES).default('retail'),
  stateCode: z.enum(INDIAN_STATE_CODES as [string, ...string[]]),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_REGEX, 'Invalid GSTIN').or(z.literal('')).optional(),
  drugLicenseNo: z.string().trim().max(60).optional(),
  drugLicenseExpiry: z.coerce.date().optional(),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  address: addressSchema.partial().optional(),
  settings: outletSettingsSchema.partial().optional(),
});
export type CreateOutletInput = z.infer<typeof createOutletSchema>;

export const updateOutletSchema = createOutletSchema.partial();
export type UpdateOutletInput = z.infer<typeof updateOutletSchema>;
