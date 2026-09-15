import { z } from 'zod';
import { isPermission } from '../permissions';

const permissionListSchema = z
  .array(z.string())
  .max(500)
  .refine((list) => list.every(isPermission), { message: 'Unknown permission key' })
  .transform((list) => Array.from(new Set(list)));

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().default(''),
  permissions: permissionListSchema,
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
