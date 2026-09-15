import { Router } from 'express';
import { z } from 'zod';
import {
  createSaleSchema,
  holdSaleSchema,
  quoteSaleSchema,
  saleListQuerySchema,
  createSalesReturnSchema,
  cancelDocumentSchema,
  paginationQuerySchema,
  idParamSchema,
  objectIdSchema,
  type CreateSaleInput,
  type HoldSaleInput,
  type QuoteSaleInput,
  type SaleListQuery,
  type CreateSalesReturnInput,
  type PaginationQuery,
} from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet, requireOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { idempotent } from '@/middleware/idempotency';
import { ok, created, noContent, paginated } from '@/lib/response';
import * as sales from './sales.service';
import * as returns from './sales-returns.service';

export const salesRouter = Router();
salesRouter.use(authenticate, resolveOutlet);

salesRouter.post('/quote', requirePermission('sales.create'), requireOutlet, validate({ body: quoteSaleSchema }), async (req, res) => {
  ok(res, await sales.quoteSale(ctxOf(req), body<QuoteSaleInput>(req)));
});

salesRouter.get('/held', requirePermission('sales.hold'), requireOutlet, async (req, res) => {
  ok(res, await sales.listHeld(ctxOf(req)));
});
salesRouter.post('/held', requirePermission('sales.hold'), requireOutlet, validate({ body: holdSaleSchema }), async (req, res) => {
  created(res, await sales.holdSale(ctxOf(req), body<HoldSaleInput>(req)));
});
salesRouter.get('/held/:id', requirePermission('sales.hold'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await sales.getHeld(ctxOf(req), params<{ id: string }>(req).id));
});
salesRouter.delete('/held/:id', requirePermission('sales.hold'), validate({ params: idParamSchema }), async (req, res) => {
  await sales.deleteHeld(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
});

salesRouter.get('/', requirePermission('sales.view'), requireOutlet, validate({ query: saleListQuerySchema }), async (req, res) => {
  const { items, meta } = await sales.listSales(ctxOf(req), query<SaleListQuery>(req));
  paginated(res, items, meta);
});
salesRouter.get('/by-customer/:customerId', requirePermission('sales.view'), validate({ params: z.object({ customerId: objectIdSchema }), query: paginationQuerySchema }), async (req, res) => {
  const { items, meta } = await sales.customerSales(ctxOf(req), params<{ customerId: string }>(req).customerId, query<PaginationQuery>(req));
  paginated(res, items, meta);
});
salesRouter.get('/:id', requirePermission('sales.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await sales.getSale(ctxOf(req), params<{ id: string }>(req).id));
});
salesRouter.post('/', requirePermission('sales.create'), requireOutlet, idempotent({ required: true }), validate({ body: createSaleSchema }), async (req, res) => {
  created(res, await sales.createSale(ctxOf(req), body<CreateSaleInput>(req), req.idempotencyKey));
});
salesRouter.post('/:id/cancel', requirePermission('sales.cancel'), validate({ params: idParamSchema, body: cancelDocumentSchema }), async (req, res) => {
  ok(res, await sales.cancelSale(ctxOf(req), params<{ id: string }>(req).id, body<{ reason: string }>(req).reason));
});

/* ---------------------------------------------------------------- sales returns */
export const salesReturnsRouter = Router();
salesReturnsRouter.use(authenticate, resolveOutlet);
const srListQuery = paginationQuerySchema.extend({ saleId: objectIdSchema.optional(), customerId: objectIdSchema.optional() });

salesReturnsRouter.get('/', requirePermission('sales.view'), requireOutlet, validate({ query: srListQuery }), async (req, res) => {
  const { items, meta } = await returns.listSalesReturns(ctxOf(req), query<PaginationQuery & { saleId?: string; customerId?: string }>(req));
  paginated(res, items, meta);
});
salesReturnsRouter.get('/:id', requirePermission('sales.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await returns.getSalesReturn(ctxOf(req), params<{ id: string }>(req).id));
});
salesReturnsRouter.post('/', requirePermission('sales.return'), requireOutlet, idempotent({ required: true }), validate({ body: createSalesReturnSchema }), async (req, res) => {
  created(res, await returns.createSalesReturn(ctxOf(req), body<CreateSalesReturnInput>(req)));
});
