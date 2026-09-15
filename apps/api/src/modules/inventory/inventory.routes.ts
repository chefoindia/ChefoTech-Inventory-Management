import { Router } from 'express';
import { z } from 'zod';
import {
  openingStockSchema,
  createAdjustmentSchema,
  adjustmentListQuerySchema,
  rejectSchema,
  stockQuerySchema,
  batchListQuerySchema,
  movementQuerySchema,
  blockBatchSchema,
  updateBatchSchema,
  createTransferSchema,
  receiveTransferSchema,
  transferListQuerySchema,
  idParamSchema,
  type OpeningStockInput,
  type CreateAdjustmentInput,
  type StockQuery,
  type BatchListQuery,
  type MovementQuery,
  type CreateTransferInput,
  type ReceiveTransferInput,
  type PaginationQuery,
} from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet, requireOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { idempotent } from '@/middleware/idempotency';
import { ok, created, paginated } from '@/lib/response';
import * as inv from './inventory.service';
import * as transfers from './transfers.service';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate, resolveOutlet);

inventoryRouter.get('/stock', requirePermission('inventory.view'), validate({ query: stockQuerySchema }), async (req, res) => {
  const { items, meta } = await inv.stockOverview(ctxOf(req), query<StockQuery>(req));
  paginated(res, items, meta);
});

inventoryRouter.get('/low-stock', requirePermission('inventory.view'), requireOutlet, validate({ query: stockQuerySchema }), async (req, res) => {
  const { items, meta } = await inv.stockOverview(ctxOf(req), { ...query<StockQuery>(req), lowStock: true });
  paginated(res, items, meta);
});

inventoryRouter.get('/batches', requirePermission('inventory.view'), requireOutlet, validate({ query: batchListQuerySchema }), async (req, res) => {
  const { items, meta } = await inv.listBatches(ctxOf(req), query<BatchListQuery>(req));
  paginated(res, items, meta);
});

inventoryRouter.patch('/batches/:id', requirePermission('inventory.adjust'), validate({ params: idParamSchema, body: updateBatchSchema }), async (req, res) => {
  ok(res, await inv.updateBatch(ctxOf(req), params<{ id: string }>(req).id, body<z.infer<typeof updateBatchSchema>>(req)));
});

inventoryRouter.post('/batches/:id/block', requirePermission('inventory.adjust'), validate({ params: idParamSchema, body: blockBatchSchema }), async (req, res) => {
  const b = body<{ blocked: boolean; reason: string }>(req);
  ok(res, await inv.blockBatch(ctxOf(req), params<{ id: string }>(req).id, b.blocked, b.reason));
});

inventoryRouter.get('/movements', requirePermission('inventory.view'), requireOutlet, validate({ query: movementQuerySchema }), async (req, res) => {
  const { items, meta } = await inv.listMovements(ctxOf(req), query<MovementQuery>(req));
  paginated(res, items, meta);
});

inventoryRouter.get('/expiry', requirePermission('inventory.view'), requireOutlet, async (req, res) => {
  ok(res, await inv.expirySummary(ctxOf(req)));
});

inventoryRouter.post('/opening-stock', requirePermission('inventory.openingStock'), requireOutlet, idempotent({ required: true }), validate({ body: openingStockSchema }), async (req, res) => {
  created(res, await inv.postOpeningStock(ctxOf(req), body<OpeningStockInput>(req)));
});

inventoryRouter.get('/adjustments', requirePermission('inventory.view'), requireOutlet, validate({ query: adjustmentListQuerySchema }), async (req, res) => {
  const { items, meta } = await inv.listAdjustments(ctxOf(req), query<PaginationQuery & { status?: string; type?: string; from?: Date; to?: Date }>(req));
  paginated(res, items, meta);
});
inventoryRouter.get('/adjustments/:id', requirePermission('inventory.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await inv.getAdjustment(ctxOf(req), params<{ id: string }>(req).id));
});
inventoryRouter.post('/adjustments', requirePermission('inventory.adjust'), requireOutlet, idempotent({ required: true }), validate({ body: createAdjustmentSchema }), async (req, res) => {
  created(res, await inv.createAdjustment(ctxOf(req), body<CreateAdjustmentInput>(req)));
});
inventoryRouter.post('/adjustments/:id/approve', requirePermission('inventory.approveAdjustment'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await inv.approveAdjustment(ctxOf(req), params<{ id: string }>(req).id));
});
inventoryRouter.post('/adjustments/:id/reject', requirePermission('inventory.approveAdjustment'), validate({ params: idParamSchema, body: rejectSchema }), async (req, res) => {
  ok(res, await inv.rejectAdjustment(ctxOf(req), params<{ id: string }>(req).id, body<{ reason: string }>(req).reason));
});

const writeOffBody = z.object({ batchId: z.string().regex(/^[a-fA-F0-9]{24}$/), qtyBase: z.number().int().min(1), kind: z.enum(['expiry', 'damage']), note: z.string().trim().max(300).optional().default('') });
inventoryRouter.post('/write-off', requirePermission('inventory.writeOff'), requireOutlet, idempotent({ required: true }), validate({ body: writeOffBody }), async (req, res) => {
  const b = body<z.infer<typeof writeOffBody>>(req);
  created(res, await inv.writeOffBatch(ctxOf(req), b.batchId, b.qtyBase, b.kind, b.note));
});

/* ---------------------------------------------------------------- transfers */
export const transfersRouter = Router();
transfersRouter.use(authenticate, resolveOutlet);

transfersRouter.get('/', requirePermission('inventory.view'), requireOutlet, validate({ query: transferListQuerySchema }), async (req, res) => {
  const { items, meta } = await transfers.listTransfers(ctxOf(req), query<PaginationQuery & { status?: string; direction: 'in' | 'out' | 'all' }>(req));
  paginated(res, items, meta);
});
transfersRouter.get('/:id', requirePermission('inventory.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await transfers.getTransfer(ctxOf(req), params<{ id: string }>(req).id));
});
transfersRouter.post('/', requirePermission('inventory.transfer.create'), requireOutlet, idempotent({ required: true }), validate({ body: createTransferSchema }), async (req, res) => {
  created(res, await transfers.createTransfer(ctxOf(req), body<CreateTransferInput>(req)));
});
transfersRouter.post('/:id/approve', requirePermission('inventory.transfer.approve'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await transfers.approveTransfer(ctxOf(req), params<{ id: string }>(req).id));
});
transfersRouter.post('/:id/dispatch', requirePermission('inventory.transfer.dispatch'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await transfers.dispatchTransfer(ctxOf(req), params<{ id: string }>(req).id));
});
transfersRouter.post('/:id/receive', requirePermission('inventory.transfer.receive'), idempotent(), validate({ params: idParamSchema, body: receiveTransferSchema }), async (req, res) => {
  ok(res, await transfers.receiveTransfer(ctxOf(req), params<{ id: string }>(req).id, body<ReceiveTransferInput>(req)));
});
transfersRouter.post('/:id/cancel', requirePermission('inventory.transfer.create'), validate({ params: idParamSchema, body: rejectSchema }), async (req, res) => {
  ok(res, await transfers.cancelTransfer(ctxOf(req), params<{ id: string }>(req).id, body<{ reason: string }>(req).reason));
});
