import { z } from 'zod';
import { emailSchema, passwordSchema, optionalPhoneSchema, slugSchema } from './common';
import { INDIAN_STATE_CODES } from '../constants/india';

export const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  organizationSlug: slugSchema.optional(),
  outletName: z.string().trim().min(2).max(120).optional(),
  stateCode: z.enum(INDIAN_STATE_CODES as [string, ...string[]]),
  ownerName: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: optionalPhoneSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  organizationId: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const switchOrganizationSchema = z.object({
  organizationId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});
