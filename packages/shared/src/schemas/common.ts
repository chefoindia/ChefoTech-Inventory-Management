import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z
    .string()
    .regex(/^-?[a-zA-Z_.]+$/, 'Invalid sort')
    .optional(),
  q: z.string().trim().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const dateRangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const addressSchema = z.object({
  line1: z.string().trim().max(200).optional().default(''),
  line2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().max(100).optional().default(''),
  state: z.string().trim().max(100).optional().default(''),
  pincode: z.string().trim().max(10).optional().default(''),
  country: z.string().trim().max(2).optional().default('IN'),
});
export type Address = z.infer<typeof addressSchema>;

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,15}$/, 'Invalid phone number');

/** Optional contact fields accept an empty string from forms and normalise it to undefined. */
export const optionalPhoneSchema = phoneSchema.or(z.literal('')).optional().transform((v) => (v ? v : undefined));
export const optionalEmailSchema = emailSchema.or(z.literal('')).optional().transform((v) => (v ? v : undefined));
export const optionalUrlSchema = z.string().trim().url().max(200).or(z.literal('')).optional().transform((v) => (v ? v : undefined));

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/, 'Use letters, numbers and hyphens only');

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .refine((v) => !/^(password|1234567890|qwertyuiop|12345678910)/i.test(v), {
    message: 'Choose a less common password',
  });

export const idParamSchema = z.object({ id: objectIdSchema });
