import { Router } from 'express';
import { z } from 'zod';
import { signUploadSchema, confirmUploadSchema, type SignUploadInput, type ConfirmUploadInput, type AttachmentRef } from '@pharmaos/shared';
import { validate, body, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { ok } from '@/lib/response';
import { ForbiddenError } from '@/lib/errors';
import { hasPermission } from '@/lib/context';
import { signUpload, confirmUpload, attachmentUrl } from '@/services/cloudinary.service';

export const attachmentsRouter = Router();
attachmentsRouter.use(authenticate, resolveOutlet);

/** Map an upload purpose to the permission that allows it. */
const PURPOSE_PERMISSION: Record<SignUploadInput['purpose'], string | null> = {
  organizationLogo: 'organization.manage',
  userAvatar: null,
  productImage: 'products.edit',
  productDocument: 'products.edit',
  prescription: 'prescriptions.manage',
  customerDocument: 'customers.manage',
  supplierDocument: 'suppliers.manage',
  purchaseInvoice: 'purchases.create',
  grnDocument: 'purchases.receive',
  adjustmentDocument: 'inventory.adjust',
  importFile: 'data.import',
  templateAsset: 'templates.manage',
};

attachmentsRouter.post('/sign-upload', validate({ body: signUploadSchema }), (req, res) => {
  const ctx = ctxOf(req);
  const input = body<SignUploadInput>(req);
  const perm = PURPOSE_PERMISSION[input.purpose];
  if (perm && !hasPermission(ctx, perm)) throw new ForbiddenError();
  ok(res, signUpload(ctx.organizationId, input.purpose, input.fileName, input.mimeType, input.bytes));
});

attachmentsRouter.post('/confirm', validate({ body: confirmUploadSchema }), async (req, res) => {
  const ctx = ctxOf(req);
  const input = body<ConfirmUploadInput>(req);
  const perm = PURPOSE_PERMISSION[input.purpose];
  if (perm && !hasPermission(ctx, perm)) throw new ForbiddenError();
  const ref = await confirmUpload(ctx.organizationId, input.purpose, input.publicId, input.originalName);
  ok(res, { ...ref, url: attachmentUrl(ref) });
});

/**
 * Resolve a short-lived URL for an attachment reference the caller already holds (from a document
 * they were allowed to read). Private assets are only ever delivered through this endpoint.
 */
const urlQuery = z.object({
  publicId: z.string().min(1).max(300),
  resourceType: z.string().max(20).default('image'),
  access: z.enum(['public', 'private']).default('private'),
  width: z.coerce.number().int().min(16).max(2000).optional(),
});

attachmentsRouter.get('/url', validate({ query: urlQuery }), (req, res) => {
  const ctx = ctxOf(req);
  const q = query<z.infer<typeof urlQuery>>(req);
  if (!q.publicId.includes(`/${ctx.organizationId.toString()}/`)) throw new ForbiddenError('Attachment does not belong to your organization');
  const ref: AttachmentRef = { provider: 'cloudinary', publicId: q.publicId, resourceType: q.resourceType, format: '', bytes: 0, access: q.access };
  ok(res, { url: attachmentUrl(ref, { width: q.width }), expiresInSeconds: q.access === 'private' ? 300 : null });
});
