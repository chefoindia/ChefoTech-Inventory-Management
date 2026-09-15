import { z } from 'zod';
import { emailSchema, objectIdSchema, phoneSchema } from './common';
import { MEMBERSHIP_STATUSES } from '../constants/enums';

export const outletAccessSchema = z.object({
  all: z.boolean().default(false),
  outletIds: z.array(objectIdSchema).max(500).default([]),
});
export type OutletAccess = z.infer<typeof outletAccessSchema>;

export const inviteUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(120),
  roleId: objectIdSchema,
  outletAccess: outletAccessSchema,
  defaultOutletId: objectIdSchema.optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(10).max(128).optional(),
});

export const updateMembershipSchema = z.object({
  roleId: objectIdSchema.optional(),
  outletAccess: outletAccessSchema.optional(),
  defaultOutletId: objectIdSchema.nullable().optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
});
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.or(z.literal('')).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
