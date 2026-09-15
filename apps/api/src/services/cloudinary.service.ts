import { v2 as cloudinary } from 'cloudinary';
import type { Types } from 'mongoose';
import type { AttachmentPurpose, AttachmentRef, SignedUploadDto } from '@pharmaos/shared';
import { env, isTest } from '@/config/env';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { randomToken } from '@/lib/crypto';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const cloudinaryConfigured = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

interface PurposeRule {
  folder: string;
  access: 'public' | 'private';
  resourceType: 'image' | 'raw' | 'auto';
  maxBytes: number;
  allowedFormats: string[];
  allowedMime: RegExp;
}

const MB = 1024 * 1024;
const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
const IMAGE_MIME = /^image\/(jpeg|png|webp)$/;
const DOC_FORMATS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const DOC_MIME = /^(application\/pdf|image\/(jpeg|png|webp))$/;

export const PURPOSE_RULES: Record<AttachmentPurpose, PurposeRule> = {
  organizationLogo: { folder: 'branding', access: 'public', resourceType: 'image', maxBytes: 2 * MB, allowedFormats: IMAGE_FORMATS, allowedMime: IMAGE_MIME },
  userAvatar: { folder: 'avatars', access: 'public', resourceType: 'image', maxBytes: 2 * MB, allowedFormats: IMAGE_FORMATS, allowedMime: IMAGE_MIME },
  productImage: { folder: 'products', access: 'public', resourceType: 'image', maxBytes: 4 * MB, allowedFormats: IMAGE_FORMATS, allowedMime: IMAGE_MIME },
  productDocument: { folder: 'product-docs', access: 'private', resourceType: 'auto', maxBytes: 10 * MB, allowedFormats: DOC_FORMATS, allowedMime: DOC_MIME },
  prescription: { folder: 'prescriptions', access: 'private', resourceType: 'auto', maxBytes: 10 * MB, allowedFormats: DOC_FORMATS, allowedMime: DOC_MIME },
  customerDocument: { folder: 'customer-docs', access: 'private', resourceType: 'auto', maxBytes: 10 * MB, allowedFormats: DOC_FORMATS, allowedMime: DOC_MIME },
  supplierDocument: { folder: 'supplier-docs', access: 'private', resourceType: 'auto', maxBytes: 10 * MB, allowedFormats: DOC_FORMATS, allowedMime: DOC_MIME },
  purchaseInvoice: { folder: 'purchase-invoices', access: 'private', resourceType: 'auto', maxBytes: 10 * MB, allowedFormats: DOC_FORMATS, allowedMime: DOC_MIME },
  grnDocument: { folder: 'grn-docs', access: 'private', resourceType: 'auto', maxBytes: 10 * MB, allowedFormats: DOC_FORMATS, allowedMime: DOC_MIME },
  adjustmentDocument: { folder: 'adjustment-docs', access: 'private', resourceType: 'auto', maxBytes: 10 * MB, allowedFormats: DOC_FORMATS, allowedMime: DOC_MIME },
  importFile: { folder: 'imports', access: 'private', resourceType: 'raw', maxBytes: 20 * MB, allowedFormats: ['csv', 'xlsx'], allowedMime: /^(text\/csv|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/ },
  templateAsset: { folder: 'template-assets', access: 'public', resourceType: 'image', maxBytes: 4 * MB, allowedFormats: IMAGE_FORMATS, allowedMime: IMAGE_MIME },
};

function extensionOf(fileName: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(fileName);
  return m ? m[1]!.toLowerCase() : '';
}

/**
 * Produces a signed direct-upload payload. The signature pins the folder, public id, access type
 * and allowed formats, so the client cannot upload something else with it.
 */
export function signUpload(organizationId: Types.ObjectId, purpose: AttachmentPurpose, fileName: string, mimeType: string, bytes: number): SignedUploadDto {
  if (!cloudinaryConfigured) throw new BusinessRuleError('File uploads are not configured on this server');
  const rule = PURPOSE_RULES[purpose];
  const ext = extensionOf(fileName);
  if (!rule.allowedFormats.includes(ext)) throw new ValidationError(`Only ${rule.allowedFormats.join(', ').toUpperCase()} files are allowed`, [{ path: 'body.fileName', message: 'Unsupported file type' }]);
  if (!rule.allowedMime.test(mimeType)) throw new ValidationError('Unsupported file type', [{ path: 'body.mimeType', message: 'Unsupported file type' }]);
  if (bytes > rule.maxBytes) throw new ValidationError(`File is larger than ${Math.round(rule.maxBytes / MB)} MB`, [{ path: 'body.bytes', message: 'Too large' }]);

  const folder = `pharmaos/${env.NODE_ENV}/${organizationId.toString()}/${rule.folder}`;
  const publicId = randomToken(12);
  const timestamp = Math.floor(Date.now() / 1000);
  const type = rule.access === 'private' ? 'authenticated' : 'upload';
  const params: Record<string, string | number> = { timestamp, folder, public_id: publicId, type, allowed_formats: rule.allowedFormats.join(',') };
  const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
    publicId,
    resourceType: rule.resourceType,
    type,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${rule.resourceType}/upload`,
    maxBytes: rule.maxBytes,
    allowedFormats: rule.allowedFormats,
  };
}

/** After the client uploads, verify the asset really exists with the expected constraints. */
export async function confirmUpload(organizationId: Types.ObjectId, purpose: AttachmentPurpose, publicId: string, originalName?: string): Promise<AttachmentRef> {
  if (!cloudinaryConfigured) throw new BusinessRuleError('File uploads are not configured on this server');
  const rule = PURPOSE_RULES[purpose];
  const expectedPrefix = `pharmaos/${env.NODE_ENV}/${organizationId.toString()}/${rule.folder}/`;
  if (!publicId.startsWith(expectedPrefix)) throw new ValidationError('Upload does not belong to this organization');

  const type = rule.access === 'private' ? 'authenticated' : 'upload';
  let resource: { resource_type: string; format?: string; bytes: number; width?: number; height?: number } | null = null;
  for (const resourceType of rule.resourceType === 'auto' ? ['image', 'raw'] : [rule.resourceType]) {
    try {
      resource = await cloudinary.api.resource(publicId, { resource_type: resourceType, type });
      break;
    } catch {
      /* try next */
    }
  }
  if (!resource) throw new ValidationError('Uploaded file was not found; please try again');
  const format = resource.format ?? extensionOf(publicId) ?? '';
  if (resource.bytes > rule.maxBytes) {
    await cloudinary.uploader.destroy(publicId, { resource_type: resource.resource_type, type }).catch(() => undefined);
    throw new ValidationError('File is too large');
  }
  if (format && !rule.allowedFormats.includes(format.toLowerCase())) {
    await cloudinary.uploader.destroy(publicId, { resource_type: resource.resource_type, type }).catch(() => undefined);
    throw new ValidationError('Unsupported file type');
  }
  return {
    provider: 'cloudinary',
    publicId,
    resourceType: resource.resource_type,
    format: format.toLowerCase(),
    bytes: resource.bytes,
    width: resource.width,
    height: resource.height,
    originalName: originalName?.slice(0, 200),
    access: rule.access,
  };
}

/** Public URL for public assets; short-lived signed URL for private ones. */
export function attachmentUrl(ref: AttachmentRef, opts: { expiresInSeconds?: number; width?: number } = {}): string {
  if (!cloudinaryConfigured || isTest) return '';
  const transformation = opts.width ? [{ width: opts.width, crop: 'limit', fetch_format: 'auto', quality: 'auto' }] : undefined;
  if (ref.access === 'public') {
    return cloudinary.url(ref.publicId, { resource_type: ref.resourceType, type: 'upload', secure: true, transformation });
  }
  const expiresAt = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 300);
  return cloudinary.url(ref.publicId, {
    resource_type: ref.resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: expiresAt,
    transformation,
  });
}

export async function deleteAsset(ref: AttachmentRef): Promise<void> {
  if (!cloudinaryConfigured) return;
  await cloudinary.uploader
    .destroy(ref.publicId, { resource_type: ref.resourceType, type: ref.access === 'private' ? 'authenticated' : 'upload' })
    .catch(() => undefined);
}

/** Server-side upload of a generated file (PDF) as a private asset. */
export async function uploadBuffer(organizationId: Types.ObjectId, folder: string, buffer: Buffer, fileName: string): Promise<AttachmentRef | null> {
  if (!cloudinaryConfigured || isTest) return null;
  const publicId = fileName.replace(/[^A-Za-z0-9-_]/g, '_');
  const result = await new Promise<{ public_id: string; resource_type: string; format?: string; bytes: number }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `pharmaos/${env.NODE_ENV}/${organizationId.toString()}/${folder}`, public_id: publicId, resource_type: 'raw', type: 'authenticated', overwrite: true },
      (err, res) => (err || !res ? reject(err) : resolve(res)),
    );
    stream.end(buffer);
  });
  return { provider: 'cloudinary', publicId: result.public_id, resourceType: 'raw', format: 'pdf', bytes: result.bytes, originalName: fileName, access: 'private' };
}
