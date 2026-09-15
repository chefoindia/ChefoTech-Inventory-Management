import { Router } from 'express';
import { z } from 'zod';
import { partyPaymentSchema, cancelDocumentSchema, paginationQuerySchema, idParamSchema, objectIdSchema, type PartyPaymentInput, type PaginationQuery } from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet, requireOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { idempotent } from '@/middleware/idempotency';
import { ok, created, paginated } from '@/lib/response';
import * as payments from './payments.service';

const listQuery = paginationQuerySchema.extend({ partyId: objectIdSchema.optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });
type ListQuery = PaginationQuery & { partyId?: string; from?: Date; to?: Date };

function partyRouter(partyType: 'customer' | 'supplier', perm: { view: string; record: string }) {
  const router = Router();
  router.use(authenticate, resolveOutlet);
  router.get('/', requirePermission(perm.view), requireOutlet, validate({ query: listQuery }), async (req, res) => {
    const { items, meta } = await payments.listPayments(ctxOf(req), partyType, query<ListQuery>(req));
    paginated(res, items, meta);
  });
  router.get('/outstanding/:partyId', requirePermission(perm.view), validate({ params: z.object({ partyId: objectIdSchema }) }), async (req, res) => {
    ok(res, await payments.outstandingDocuments(ctxOf(req), partyType, params<{ partyId: string }>(req).partyId));
  });
  router.get('/:id', requirePermission(perm.view), validate({ params: idParamSchema }), async (req, res) => {
    ok(res, await payments.getPayment(ctxOf(req), params<{ id: string }>(req).id));
  });
  router.post('/', requirePermission(perm.record), requireOutlet, idempotent({ required: true }), validate({ body: partyPaymentSchema }), async (req, res) => {
    created(res, await payments.recordPayment(ctxOf(req), partyType, body<PartyPaymentInput>(req)));
  });
  router.post('/:id/cancel', requirePermission(perm.record), validate({ params: idParamSchema, body: cancelDocumentSchema }), async (req, res) => {
    ok(res, await payments.cancelPayment(ctxOf(req), params<{ id: string }>(req).id, body<{ reason: string }>(req).reason));
  });
  return router;
}

export const customerPaymentsRouter = partyRouter('customer', { view: 'customers.viewLedger', record: 'sales.collectPayment' });
export const supplierPaymentsRouter = partyRouter('supplier', { view: 'suppliers.viewLedger', record: 'purchases.pay' });
