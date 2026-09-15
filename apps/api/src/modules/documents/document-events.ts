import { Types } from 'mongoose';
import { events } from '@/lib/events';
import { logger } from '@/lib/logger';
import type { RequestContext } from '@/lib/context';
import { ALL_PERMISSIONS } from '@pharmaos/shared';
import { SaleModel } from '@/models/sale.model';
import { emailDocument } from './documents.service';

/** A system context for background work on behalf of an organization (no user session). */
export function systemContext(organizationId: Types.ObjectId, outletId?: Types.ObjectId, userId?: Types.ObjectId): RequestContext {
  return {
    requestId: `system-${Date.now()}`,
    userId: userId ?? new Types.ObjectId('000000000000000000000000'),
    organizationId,
    membershipId: new Types.ObjectId('000000000000000000000000'),
    sessionId: new Types.ObjectId('000000000000000000000000'),
    outletId,
    isOwner: true,
    roleKey: 'system',
    permissions: new Set(ALL_PERMISSIONS),
    outletAccess: null,
  };
}

/** After a sale commits with `sendEmail`, render the invoice and email it. Failures are recorded on the sale, never thrown into the POS flow. */
export function registerDocumentEventHandlers(): void {
  events.on('sale.completed', async ({ organizationId, outletId, saleId, sendEmail }) => {
    if (!sendEmail) return;
    const sale = await SaleModel.findById(saleId).select('soldBy email').lean();
    if (!sale) return;
    const ctx = systemContext(organizationId, outletId, sale.soldBy ?? undefined);
    try {
      await emailDocument(ctx, 'saleInvoice', String(saleId));
    } catch (err) {
      logger.warn({ err, saleId }, 'auto invoice email failed');
    }
  });
}
