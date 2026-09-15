import { z } from 'zod';
import { objectIdSchema } from './common';

/** What the upload is for; decides folder, allowed formats, size limits and privacy. */
export const ATTACHMENT_PURPOSES = [
  'organizationLogo',
  'userAvatar',
  'productImage',
  'productDocument',
  'prescription',
  'customerDocument',
  'supplierDocument',
  'purchaseInvoice',
  'grnDocument',
  'adjustmentDocument',
  'importFile',
  'templateAsset',
] as const;
export type AttachmentPurpose = (typeof ATTACHMENT_PURPOSES)[number];

export const signUploadSchema = z.object({
  purpose: z.enum(ATTACHMENT_PURPOSES),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(100),
  bytes: z.number().int().min(1),
  /** Owning entity, if known at upload time (used for folder placement). */
  entityId: objectIdSchema.optional(),
});
export type SignUploadInput = z.infer<typeof signUploadSchema>;

export const confirmUploadSchema = z.object({
  purpose: z.enum(ATTACHMENT_PURPOSES),
  publicId: z.string().trim().min(1).max(300),
  originalName: z.string().trim().max(200).optional(),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

export const attachmentRefSchema = z.object({
  provider: z.literal('cloudinary'),
  publicId: z.string().min(1).max(300),
  resourceType: z.string().max(20),
  format: z.string().max(20),
  bytes: z.number().int().min(0),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  originalName: z.string().max(200).optional(),
  access: z.enum(['public', 'private']),
});
