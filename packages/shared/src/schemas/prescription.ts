import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './common';
import { attachmentRefSchema } from './attachment';

export const prescriptionItemSchema = z.object({
  medicine: z.string().trim().min(1).max(160),
  dosage: z.string().trim().max(120).optional().default(''),
  duration: z.string().trim().max(60).optional().default(''),
  productId: objectIdSchema.optional(),
});

export const createPrescriptionSchema = z.object({
  customerId: objectIdSchema,
  doctorName: z.string().trim().min(1).max(120),
  doctorRegNo: z.string().trim().max(60).optional().default(''),
  hospital: z.string().trim().max(160).optional().default(''),
  prescriptionDate: z.coerce.date(),
  validUntil: z.coerce.date().optional(),
  diagnosis: z.string().trim().max(300).optional().default(''),
  items: z.array(prescriptionItemSchema).max(50).default([]),
  files: z.array(attachmentRefSchema).max(10).default([]),
  notes: z.string().trim().max(1000).optional().default(''),
});
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

export const updatePrescriptionSchema = createPrescriptionSchema.partial().extend({
  status: z.enum(['active', 'used', 'expired', 'archived']).optional(),
});
export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;

export const prescriptionListQuerySchema = paginationQuerySchema.extend({
  customerId: objectIdSchema.optional(),
  status: z.enum(['active', 'used', 'expired', 'archived']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type PrescriptionListQuery = z.infer<typeof prescriptionListQuerySchema>;

export interface PrescriptionDto {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  doctorName: string;
  doctorRegNo: string;
  hospital: string;
  prescriptionDate: string;
  validUntil: string | null;
  diagnosis: string;
  items: { medicine: string; dosage: string; duration: string; productId: string | null }[];
  files: { provider: 'cloudinary'; publicId: string; resourceType: string; format: string; bytes: number; originalName?: string; access: 'public' | 'private' }[];
  notes: string;
  linkedSales: { id: string; number: string; date: string }[];
  status: 'active' | 'used' | 'expired' | 'archived';
  createdBy: { id: string; name: string } | null;
  createdAt: string;
}
