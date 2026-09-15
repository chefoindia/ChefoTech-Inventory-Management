import { Router } from 'express';
import { z } from 'zod';
import {
  createCategorySchema,
  updateCategorySchema,
  createUnitSchema,
  updateUnitSchema,
  createProductSchema,
  updateProductSchema,
  productListQuerySchema,
  productSearchQuerySchema,
  attachmentRefSchema,
  idParamSchema,
  objectIdSchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type CreateUnitInput,
  type CreateProductInput,
  type UpdateProductInput,
  type ProductListQuery,
  type AttachmentRef,
} from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok, created, noContent, paginated } from '@/lib/response';
import * as units from './units.service';
import * as categories from './categories.service';
import * as products from './products.service';

/* ---------------------------------------------------------------- units */
export const unitsRouter = Router();
unitsRouter.use(authenticate, resolveOutlet);
const includeInactiveQuery = z.object({ includeInactive: z.coerce.boolean().default(false) });

unitsRouter.get('/', requirePermission('products.view'), validate({ query: includeInactiveQuery }), async (req, res) => {
  ok(res, await units.listUnits(ctxOf(req), query<{ includeInactive: boolean }>(req).includeInactive));
});
unitsRouter.post('/', requirePermission('products.manageCategories'), validate({ body: createUnitSchema }), async (req, res) => {
  created(res, await units.createUnit(ctxOf(req), body<CreateUnitInput>(req)));
});
unitsRouter.patch('/:id', requirePermission('products.manageCategories'), validate({ params: idParamSchema, body: updateUnitSchema }), async (req, res) => {
  ok(res, await units.updateUnit(ctxOf(req), params<{ id: string }>(req).id, body<Partial<CreateUnitInput> & { status?: string }>(req)));
});

/* ---------------------------------------------------------------- categories */
export const categoriesRouter = Router();
categoriesRouter.use(authenticate, resolveOutlet);

categoriesRouter.get('/', requirePermission('products.view'), validate({ query: includeInactiveQuery }), async (req, res) => {
  ok(res, await categories.listCategories(ctxOf(req), query<{ includeInactive: boolean }>(req).includeInactive));
});
categoriesRouter.post('/', requirePermission('products.manageCategories'), validate({ body: createCategorySchema }), async (req, res) => {
  created(res, await categories.createCategory(ctxOf(req), body<CreateCategoryInput>(req)));
});
categoriesRouter.patch('/:id', requirePermission('products.manageCategories'), validate({ params: idParamSchema, body: updateCategorySchema }), async (req, res) => {
  ok(res, await categories.updateCategory(ctxOf(req), params<{ id: string }>(req).id, body<UpdateCategoryInput>(req)));
});
categoriesRouter.delete('/:id', requirePermission('products.manageCategories'), validate({ params: idParamSchema }), async (req, res) => {
  await categories.archiveCategory(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
});

/* ---------------------------------------------------------------- products */
export const productsRouter = Router();
productsRouter.use(authenticate, resolveOutlet);

productsRouter.get('/search', requirePermission('products.view'), validate({ query: productSearchQuerySchema }), async (req, res) => {
  const q = query<{ q: string; limit: number; withStock: boolean }>(req);
  ok(res, await products.searchProducts(ctxOf(req), q.q, q.limit, q.withStock));
});

productsRouter.get('/by-barcode/:code', requirePermission('products.view'), validate({ params: z.object({ code: z.string().trim().min(3).max(48) }) }), async (req, res) => {
  ok(res, await products.findByBarcode(ctxOf(req), params<{ code: string }>(req).code));
});

productsRouter.get('/', requirePermission('products.view'), validate({ query: productListQuerySchema }), async (req, res) => {
  const { items, meta } = await products.listProducts(ctxOf(req), query<ProductListQuery>(req));
  paginated(res, items, meta);
});

productsRouter.get('/:id', requirePermission('products.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await products.getProduct(ctxOf(req), params<{ id: string }>(req).id));
});

productsRouter.post('/', requirePermission('products.create'), validate({ body: createProductSchema }), async (req, res) => {
  created(res, await products.createProduct(ctxOf(req), body<CreateProductInput>(req)));
});

productsRouter.patch('/:id', requirePermission('products.edit'), validate({ params: idParamSchema, body: updateProductSchema }), async (req, res) => {
  ok(res, await products.updateProduct(ctxOf(req), params<{ id: string }>(req).id, body<UpdateProductInput>(req)));
});

productsRouter.post('/:id/archive', requirePermission('products.archive'), validate({ params: idParamSchema }), async (req, res) => {
  await products.archiveProduct(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
});

productsRouter.post('/:id/barcodes/generate', requirePermission('products.manageBarcodes'), validate({ params: idParamSchema, body: z.object({ unitId: objectIdSchema.optional() }) }), async (req, res) => {
  ok(res, await products.generateInternalBarcode(ctxOf(req), params<{ id: string }>(req).id, body<{ unitId?: string }>(req).unitId));
});

const attachmentBody = z.object({ kind: z.enum(['images', 'documents']), attachment: attachmentRefSchema });
productsRouter.post('/:id/attachments', requirePermission('products.edit'), validate({ params: idParamSchema, body: attachmentBody }), async (req, res) => {
  const b = body<{ kind: 'images' | 'documents'; attachment: AttachmentRef }>(req);
  ok(res, await products.addAttachment(ctxOf(req), params<{ id: string }>(req).id, b.kind, b.attachment));
});
productsRouter.delete('/:id/attachments', requirePermission('products.edit'), validate({ params: idParamSchema, body: z.object({ kind: z.enum(['images', 'documents']), publicId: z.string().min(1) }) }), async (req, res) => {
  const b = body<{ kind: 'images' | 'documents'; publicId: string }>(req);
  ok(res, await products.removeAttachment(ctxOf(req), params<{ id: string }>(req).id, b.kind, b.publicId));
});
