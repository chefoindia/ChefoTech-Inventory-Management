import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { DocumentTemplateType, ShareLinkDto } from '@pharmaos/shared';
import { env } from '@/config/env';
import type { RequestContext } from '@/lib/context';
import { ValidationError } from '@/lib/errors';
import { audit } from '@/services/audit.service';
import { toE164 } from '@/services/messaging/messaging.service';
import { renderDocument, type RenderResult } from './documents.service';
import { dataFor } from './data-providers';

/**
 * Signed, expiring public links so a bill can be shared on WhatsApp or SMS without exposing
 * storage URLs or requiring the customer to log in. The token carries no data beyond the
 * document reference; rendering still happens through the normal document pipeline.
 */
const SHARE_TTL_DAYS = 7;
const secret = () => env.SHARE_LINK_SECRET || env.JWT_ACCESS_SECRET;

interface ShareClaims {
  kind: 'doc-share';
  org: string;
  user: string;
  outlet?: string;
  type: DocumentTemplateType;
  ref: string;
  from?: string;
  to?: string;
}

export async function createShareLink(ctx: RequestContext, documentType: DocumentTemplateType, refId: string, opts: { phone?: string; label?: string; from?: Date; to?: Date } = {}): Promise<ShareLinkDto> {
  // Ownership check: the data provider is tenant-scoped and throws NotFound for another organization's record.
  const data = await dataFor(ctx, documentType, refId, { from: opts.from, to: opts.to });
  const claims: ShareClaims = { kind: 'doc-share', org: String(ctx.organizationId), user: String(ctx.userId), outlet: ctx.outletId ? String(ctx.outletId) : undefined, type: documentType, ref: refId, from: opts.from?.toISOString(), to: opts.to?.toISOString() };
  const token = jwt.sign(claims, secret(), { expiresIn: `${SHARE_TTL_DAYS}d` });
  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 86_400_000).toISOString();
  const url = `${env.WEB_ORIGIN.replace(/\/$/, '')}/share/${token}`;
  const message = `${opts.label ?? data.refNumber ?? 'Your document'} from PharmaOS: ${url}`;
  const phone = opts.phone ? toE164(opts.phone).replace('+', '') : '';
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  void audit(ctx, { action: 'document.shared', entityType: documentType, entityId: new Types.ObjectId(refId), summary: `Created a share link for ${documentType} ${refId}` });
  return { url, expiresAt, whatsappUrl, message };
}

/** Verifies a share token and renders the PDF with a minimal, permission-scoped context. */
export async function renderSharedDocument(token: string, renderPermission: Record<DocumentTemplateType, string>): Promise<RenderResult> {
  let claims: ShareClaims;
  try {
    claims = jwt.verify(token, secret()) as ShareClaims;
  } catch {
    throw new ValidationError('This share link is invalid or has expired');
  }
  if (claims.kind !== 'doc-share') throw new ValidationError('This share link is invalid or has expired');
  const ctx: RequestContext = {
    requestId: `share-${Date.now()}`,
    userId: new Types.ObjectId(claims.user),
    organizationId: new Types.ObjectId(claims.org),
    membershipId: new Types.ObjectId(),
    sessionId: new Types.ObjectId(),
    outletId: claims.outlet ? new Types.ObjectId(claims.outlet) : undefined,
    isOwner: false,
    roleKey: 'share-link',
    permissions: new Set([renderPermission[claims.type]]),
    outletAccess: null,
  };
  return renderDocument(ctx, claims.type, claims.ref, { from: claims.from ? new Date(claims.from) : undefined, to: claims.to ? new Date(claims.to) : undefined });
}
