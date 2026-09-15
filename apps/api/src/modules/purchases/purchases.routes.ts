import { Router } from 'express';
import { z } from 'zod';
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  purchaseListQuerySchema,
  createGrnSchema,
  createPurchaseReturnSchema,
  cancelDocumentSchema,
  paginationQuerySchema,
  idParamSchema,
  objectIdSchema,
  type CreatePurchaseInput,
  type UpdatePurchaseInput,
  type PurchaseListQuery,
  type CreateGrnInput,
  type CreatePurchaseReturnInput,
  type PaginationQuery,
} from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet, requireOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { idempotent } from '@/middleware/idempotency';
import { ok, created, paginated } from '@/lib/response';
import * as purchases from './purchases.service';
import * as grn from './grn.service';
import * as returns from './purchase-returns.service';

export const purchasesRouter = Router();
purchasesRouter.use(authenticate, resolveOutlet);

purchasesRouter.get('/', requirePermission('purchases.view'), requireOutlet, validate({ query: purchaseListQuerySchema }), async (req, res) => {
  const { items, meta } = await purchases.listPurchases(ctxOf(req), query<PurchaseListQuery>(req));
  paginated(res, items, meta);
});
purchasesRouter.get('/:id', requirePermission('purchases.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await purchases.getPurchase(ctxOf(req), params<{ id: string }>(req).id));
});
purchasesRouter.post('/', requirePermission('purchases.create'), requireOutlet, idempotent({ required: true }), validate({ body: createPurchaseSchema }), async (req, res) => {
  created(res, await purchases.createPurchase(ctxOf(req), body<CreatePurchaseInput>(req), req.idempotencyKey));
});
purchasesRouter.patch('/:id', requirePermission('purchases.edit'), validate({ params: idParamSchema, body: updatePurchaseSchema }), async (req, res) => {
  ok(res, await purchases.updatePurchase(ctxOf(req), params<{ id: string }>(req).id, body<UpdatePurchaseInput>(req)));
});
purchasesRouter.post('/:id/cancel', requirePermission('purchases.cancel'), validate({ params: idParamSchema, body: cancelDocumentSchema }), async (req, res) => {
  ok(res, await purchases.cancelPurchase(ctxOf(req), params<{ id: string }>(req).id, body<{ reason: string }>(req).reason));
});

/* ---------------------------------------------------------------- GRN */
export const grnRouter = Router();
grnRouter.use(authenticate, resolveOutlet);
const grnListQuery = paginationQuerySchema.extend({ purchaseId: objectIdSchema.optional(), status: z.enum(['draft', 'confirmed']).optional() });

grnRouter.get('/', requirePermission('purchases.view'), requireOutlet, validate({ query: grnListQuery }), async (req, res) => {
  const { items, meta } = await grn.listGrns(ctxOf(req), query<PaginationQuery & { purchaseId?: string; status?: string }>(req));
  paginated(res, items, meta);
});
grnRouter.get('/:id', requirePermission('purchases.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await grn.getGrn(ctxOf(req), params<{ id: string }>(req).id));
});
grnRouter.post('/', requirePermission('purchases.receive'), requireOutlet, idempotent({ required: true }), validate({ body: createGrnSchema }), async (req, res) => {
  created(res, await grn.createGrn(ctxOf(req), body<CreateGrnInput>(req)));
});
grnRouter.post('/:id/confirm', requirePermission('purchases.approveGrn'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await grn.confirmGrn(ctxOf(req), params<{ id: string }>(req).id));
});

/* ---------------------------------------------------------------- purchase returns */
export const purchaseReturnsRouter = Router();
purchaseReturnsRouter.use(authenticate, resolveOutlet);
const prListQuery = paginationQuerySchema.extend({ supplierId: objectIdSchema.optional() });

purchaseReturnsRouter.get('/', requirePermission('purchases.view'), requireOutlet, validate({ query: prListQuery }), async (req, res) => {
  const { items, meta } = await returns.listPurchaseReturns(ctxOf(req), query<PaginationQuery & { supplierId?: string }>(req));
  paginated(res, items, meta);
});
purchaseReturnsRouter.get('/:id', requirePermission('purchases.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await returns.getPurchaseReturn(ctxOf(req), params<{ id: string }>(req).id));
});
purchaseReturnsRouter.post('/', requirePermission('purchases.return'), requireOutlet, idempotent({ required: true }), validate({ body: createPurchaseReturnSchema }), async (req, res) => {
  created(res, await returns.createPurchaseReturn(ctxOf(req), body<CreatePurchaseReturnInput>(req)));
});
