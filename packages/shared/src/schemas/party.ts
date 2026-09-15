import { z } from 'zod';
import { addressSchema, objectIdSchema, optionalEmailSchema, optionalPhoneSchema, paginationQuerySchema, phoneSchema } from './common';
import { GSTIN_REGEX, INDIAN_STATE_CODES, PAN_REGEX } from '../constants/india';
import { ENTITY_STATUSES, PAYMENT_METHODS } from '../constants/enums';
import { customFieldValuesSchema } from './product';

const gstinField = z.string().trim().toUpperCase().regex(GSTIN_REGEX, 'Invalid GSTIN').or(z.literal('')).optional().default('');
const stateField = z.enum(INDIAN_STATE_CODES as [string, ...string[]]).or(z.literal('')).optional().default('');

/* ---------------------------------------------------------------- suppliers */

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(20).optional().default(''),
  contactPerson: z.string().trim().max(120).optional().default(''),
  phone: optionalPhoneSchema,
  altPhone: optionalPhoneSchema,
  email: optionalEmailSchema,
  address: addressSchema.partial().optional(),
  gstin: gstinField,
  stateCode: stateField,
  pan: z.string().trim().toUpperCase().regex(PAN_REGEX, 'Invalid PAN').or(z.literal('')).optional().default(''),
  drugLicenseNo: z.string().trim().max(60).optional().default(''),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  openingBalanceMinor: z.number().int().default(0),
  bank: z
    .object({
      accountName: z.string().trim().max(120).optional().default(''),
      accountNumber: z.string().trim().max(34).optional().default(''),
      ifsc: z.string().trim().max(11).optional().default(''),
      upiId: z.string().trim().max(60).optional().default(''),
    })
    .optional(),
  notes: z.string().trim().max(1000).optional().default(''),
  customFields: customFieldValuesSchema,
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export const updateSupplierSchema = createSupplierSchema.partial().extend({ status: z.enum(ENTITY_STATUSES).optional() });
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

/* ---------------------------------------------------------------- customers */

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  altPhone: optionalPhoneSchema,
  email: optionalEmailSchema,
  address: addressSchema.partial().optional(),
  gstin: gstinField,
  stateCode: stateField,
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional().default(''),
  creditLimitMinor: z.number().int().min(0).default(0),
  creditDays: z.number().int().min(0).max(365).optional(),
  openingBalanceMinor: z.number().int().default(0),
  defaultDiscountBps: z.number().int().min(0).max(10_000).default(0),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  notes: z.string().trim().max(1000).optional().default(''),
  customFields: customFieldValuesSchema,
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export const updateCustomerSchema = createCustomerSchema.partial().extend({ status: z.enum(ENTITY_STATUSES).optional() });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const partyListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ENTITY_STATUSES).optional(),
  hasBalance: z.coerce.boolean().optional(),
});
export type PartyListQuery = z.infer<typeof partyListQuerySchema>;

/* ---------------------------------------------------------------- payments & ledger */

export const paymentLineSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amountMinor: z.number().int().min(1),
  reference: z.string().trim().max(80).optional().default(''),
});
export type PaymentLineInput = z.infer<typeof paymentLineSchema>;

/** Payment received from a customer (or paid to a supplier) with optional invoice allocations. */
export const partyPaymentSchema = z.object({
  partyId: objectIdSchema,
  date: z.coerce.date().optional(),
  method: z.enum(PAYMENT_METHODS.filter((m) => m !== 'credit') as [string, ...string[]]),
  amountMinor: z.number().int().min(1),
  reference: z.string().trim().max(80).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
  /** Explicit allocations; when empty the server allocates oldest-first. */
  allocations: z.array(z.object({ documentId: objectIdSchema, amountMinor: z.number().int().min(1) })).max(100).default([]),
});
export type PartyPaymentInput = z.infer<typeof partyPaymentSchema>;

export const ledgerAdjustmentSchema = z.object({
  partyId: objectIdSchema,
  /** Positive increases what the party owes (customer) / what we owe (supplier); negative reduces. */
  amountMinor: z.number().int().refine((v) => v !== 0, 'Amount cannot be zero'),
  reason: z.string().trim().min(3).max(300),
});
export type LedgerAdjustmentInput = z.infer<typeof ledgerAdjustmentSchema>;

export const ledgerQuerySchema = paginationQuerySchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
