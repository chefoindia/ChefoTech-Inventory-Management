import { Router } from 'express';
import { z } from 'zod';
import {
  createSupplierSchema,
  updateSupplierSchema,
  createCustomerSchema,
  updateCustomerSchema,
  partyListQuerySchema,
  ledgerQuerySchema,
  ledgerAdjustmentSchema,
  attachmentRefSchema,
  idParamSchema,
  type CreateSupplierInput,
  type UpdateSupplierInput,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type PartyListQuery,
  type LedgerAdjustmentInput,
  type AttachmentRef,
  type PaginationQuery,
} from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok, created, paginated } from '@/lib/response';
import { listLedger } from '@/services/ledger.service';
import * as suppliers from './suppliers.service';
import * as customers from './customers.service';

type LedgerQuery = PaginationQuery & { from?: Date; to?: Date };
const docBody = z.object({ attachment: attachmentRefSchema });
const removeDocBody = z.object({ publicId: z.string().min(1) });
const searchQuery = z.object({ q: z.string().trim().min(1).max(60), limit: z.coerce.number().int().min(1).max(25).default(10) });

/* ---------------------------------------------------------------- suppliers */
export const suppliersRouter = Router();
suppliersRouter.use(authenticate, resolveOutlet);

suppliersRouter.get('/', requirePermission('suppliers.view'), validate({ query: partyListQuerySchema }), async (req, res) => {
  const { items, meta } = await suppliers.listSuppliers(ctxOf(req), query<PartyListQuery>(req));
  paginated(res, items, meta);
});
suppliersRouter.get('/:id', requirePermission('suppliers.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await suppliers.getSupplier(ctxOf(req), params<{ id: string }>(req).id));
});
suppliersRouter.post('/', requirePermission('suppliers.manage'), validate({ body: createSupplierSchema }), async (req, res) => {
  created(res, await suppliers.createSupplier(ctxOf(req), body<CreateSupplierInput>(req)));
});
suppliersRouter.patch('/:id', requirePermission('suppliers.manage'), validate({ params: idParamSchema, body: updateSupplierSchema }), async (req, res) => {
  ok(res, await suppliers.updateSupplier(ctxOf(req), params<{ id: string }>(req).id, body<UpdateSupplierInput>(req)));
});
suppliersRouter.get('/:id/ledger', requirePermission('suppliers.viewLedger'), validate({ params: idParamSchema, query: ledgerQuerySchema }), async (req, res) => {
  const { items, meta } = await listLedger(ctxOf(req), 'supplier', params<{ id: string }>(req).id, query<LedgerQuery>(req));
  paginated(res, items, meta);
});
suppliersRouter.post('/:id/documents', requirePermission('suppliers.manage'), validate({ params: idParamSchema, body: docBody }), async (req, res) => {
  ok(res, await suppliers.addSupplierDocument(ctxOf(req), params<{ id: string }>(req).id, body<{ attachment: AttachmentRef }>(req).attachment));
});
suppliersRouter.delete('/:id/documents', requirePermission('suppliers.manage'), validate({ params: idParamSchema, body: removeDocBody }), async (req, res) => {
  ok(res, await suppliers.removeSupplierDocument(ctxOf(req), params<{ id: string }>(req).id, body<{ publicId: string }>(req).publicId));
});
suppliersRouter.post('/ledger-adjustments', requirePermission('suppliers.adjustBalance'), validate({ body: ledgerAdjustmentSchema }), async (req, res) => {
  created(res, await customers.adjustBalance(ctxOf(req), 'supplier', body<LedgerAdjustmentInput>(req)));
});

/* ---------------------------------------------------------------- customers */
export const customersRouter = Router();
customersRouter.use(authenticate, resolveOutlet);

customersRouter.get('/search', requirePermission('customers.view'), validate({ query: searchQuery }), async (req, res) => {
  const q = query<{ q: string; limit: number }>(req);
  ok(res, await customers.searchCustomers(ctxOf(req), q.q, q.limit));
});
customersRouter.get('/', requirePermission('customers.view'), validate({ query: partyListQuerySchema }), async (req, res) => {
  const { items, meta } = await customers.listCustomers(ctxOf(req), query<PartyListQuery>(req));
  paginated(res, items, meta);
});
customersRouter.get('/:id', requirePermission('customers.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await customers.getCustomer(ctxOf(req), params<{ id: string }>(req).id));
});
customersRouter.post('/', requirePermission('customers.manage'), validate({ body: createCustomerSchema }), async (req, res) => {
  created(res, await customers.createCustomer(ctxOf(req), body<CreateCustomerInput>(req)));
});
customersRouter.patch('/:id', requirePermission('customers.manage'), validate({ params: idParamSchema, body: updateCustomerSchema }), async (req, res) => {
  ok(res, await customers.updateCustomer(ctxOf(req), params<{ id: string }>(req).id, body<UpdateCustomerInput>(req)));
});
customersRouter.get('/:id/ledger', requirePermission('customers.viewLedger'), validate({ params: idParamSchema, query: ledgerQuerySchema }), async (req, res) => {
  const { items, meta } = await listLedger(ctxOf(req), 'customer', params<{ id: string }>(req).id, query<LedgerQuery>(req));
  paginated(res, items, meta);
});
customersRouter.post('/:id/documents', requirePermission('customers.manage'), validate({ params: idParamSchema, body: docBody }), async (req, res) => {
  ok(res, await customers.addCustomerDocument(ctxOf(req), params<{ id: string }>(req).id, body<{ attachment: AttachmentRef }>(req).attachment));
});
customersRouter.delete('/:id/documents', requirePermission('customers.manage'), validate({ params: idParamSchema, body: removeDocBody }), async (req, res) => {
  ok(res, await customers.removeCustomerDocument(ctxOf(req), params<{ id: string }>(req).id, body<{ publicId: string }>(req).publicId));
});
customersRouter.post('/ledger-adjustments', requirePermission('customers.adjustBalance'), validate({ body: ledgerAdjustmentSchema }), async (req, res) => {
  created(res, await customers.adjustBalance(ctxOf(req), 'customer', body<LedgerAdjustmentInput>(req)));
});
