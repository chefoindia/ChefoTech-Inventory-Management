import { Router } from 'express';
import { z } from 'zod';
import {
  createTemplateSchema,
  saveTemplateVersionSchema,
  renameTemplateSchema,
  templateLayoutSchema,
  emailInvoiceSchema,
  idParamSchema,
  objectIdSchema,
  DOCUMENT_TEMPLATE_TYPES,
  PAGE_DIMENSIONS,
  DOCUMENT_TEMPLATE_LABELS,
  type CreateTemplateInput,
  type TemplateLayout,
  type DocumentTemplateType,
} from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { heavyRateLimit } from '@/middleware/rate-limit';
import { ok, created, noContent } from '@/lib/response';
import { hasPermission } from '@/lib/context';
import { ForbiddenError } from '@/lib/errors';
import * as docs from './documents.service';
import { BINDING_GROUPS, TABLE_COLUMN_CATALOGUE } from './data-providers';
import { createShareLink, renderSharedDocument } from './share-links';

const typeParam = z.object({ type: z.enum(DOCUMENT_TEMPLATE_TYPES) });
const typeAndId = z.object({ type: z.enum(DOCUMENT_TEMPLATE_TYPES), refId: objectIdSchema });
const renderQuery = z.object({ templateId: objectIdSchema.optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), force: z.coerce.boolean().default(false), download: z.coerce.boolean().default(false) });

/** Permission needed to render each document type. */
const RENDER_PERMISSION: Record<DocumentTemplateType, string> = {
  saleInvoice: 'sales.view',
  saleReceipt: 'sales.view',
  purchaseInvoice: 'purchases.view',
  grn: 'purchases.view',
  paymentReceipt: 'sales.view',
  salesReturn: 'sales.view',
  purchaseReturn: 'purchases.view',
  customerStatement: 'customers.viewLedger',
  supplierStatement: 'suppliers.viewLedger',
  stockTransfer: 'inventory.view',
  stockAdjustment: 'inventory.view',
  barcodeLabel: 'products.view',
};

function sendPdf(res: Parameters<typeof ok>[0], buffer: Buffer, fileName: string, download: boolean) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}

/* ---------------------------------------------------------------- templates */
export const templatesRouter = Router();
templatesRouter.use(authenticate, resolveOutlet);

templatesRouter.get('/catalogue', requirePermission('templates.view'), (_req, res) => {
  ok(res, { documentTypes: DOCUMENT_TEMPLATE_TYPES.map((t) => ({ key: t, label: DOCUMENT_TEMPLATE_LABELS[t] })), pageSizes: PAGE_DIMENSIONS, bindings: BINDING_GROUPS, tableColumns: TABLE_COLUMN_CATALOGUE });
});
templatesRouter.get('/', requirePermission('templates.view'), validate({ query: z.object({ documentType: z.enum(DOCUMENT_TEMPLATE_TYPES).optional() }) }), async (req, res) => {
  ok(res, await docs.listTemplates(ctxOf(req), query<{ documentType?: string }>(req).documentType));
});
templatesRouter.get('/:id', requirePermission('templates.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await docs.getTemplate(ctxOf(req), params<{ id: string }>(req).id));
});
templatesRouter.post('/', requirePermission('templates.manage'), validate({ body: createTemplateSchema }), async (req, res) => {
  created(res, await docs.createTemplate(ctxOf(req), body<CreateTemplateInput>(req)));
});
templatesRouter.post('/:id/versions', requirePermission('templates.manage'), validate({ params: idParamSchema, body: saveTemplateVersionSchema }), async (req, res) => {
  const b = body<{ layout: TemplateLayout; note: string }>(req);
  ok(res, await docs.saveVersion(ctxOf(req), params<{ id: string }>(req).id, b.layout, b.note));
});
templatesRouter.post('/:id/versions/:version/restore', requirePermission('templates.manage'), validate({ params: idParamSchema.extend({ version: z.coerce.number().int().min(1) }) }), async (req, res) => {
  const p = params<{ id: string; version: number }>(req);
  ok(res, await docs.restoreVersion(ctxOf(req), p.id, p.version));
});
templatesRouter.patch('/:id', requirePermission('templates.manage'), validate({ params: idParamSchema, body: renameTemplateSchema }), async (req, res) => {
  ok(res, await docs.renameTemplate(ctxOf(req), params<{ id: string }>(req).id, body<{ name: string }>(req).name));
});
templatesRouter.post('/:id/default', requirePermission('templates.manage'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await docs.setDefaultTemplate(ctxOf(req), params<{ id: string }>(req).id));
});
templatesRouter.delete('/:id', requirePermission('templates.manage'), validate({ params: idParamSchema }), async (req, res) => {
  await docs.archiveTemplate(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
});
/** Live preview from an unsaved layout, with sample or real data. */
templatesRouter.post('/preview/:type', requirePermission('templates.view'), heavyRateLimit, validate({ params: typeParam, body: z.object({ layout: templateLayoutSchema, refId: objectIdSchema.optional() }) }), async (req, res) => {
  const b = body<{ layout: TemplateLayout; refId?: string }>(req);
  const buffer = await docs.previewTemplate(ctxOf(req), params<{ type: DocumentTemplateType }>(req).type, b.layout, b.refId);
  sendPdf(res, buffer, 'preview.pdf', false);
});

/* ---------------------------------------------------------------- documents */
export const documentsRouter = Router();
documentsRouter.use(authenticate, resolveOutlet);

documentsRouter.get('/history/:refType/:refId', validate({ params: z.object({ refType: z.string().min(1).max(40), refId: objectIdSchema }) }), async (req, res) => {
  const p = params<{ refType: string; refId: string }>(req);
  ok(res, await docs.documentHistory(ctxOf(req), p.refType, p.refId));
});
documentsRouter.get('/stored/:id', validate({ params: idParamSchema, query: z.object({ download: z.coerce.boolean().default(false) }) }), async (req, res) => {
  const { buffer, fileName } = await docs.historicalPdf(ctxOf(req), params<{ id: string }>(req).id);
  sendPdf(res, buffer, fileName, query<{ download: boolean }>(req).download);
});
documentsRouter.get('/:type/:refId', heavyRateLimit, validate({ params: typeAndId, query: renderQuery }), async (req, res) => {
  const ctx = ctxOf(req);
  const p = params<{ type: DocumentTemplateType; refId: string }>(req);
  if (!hasPermission(ctx, RENDER_PERMISSION[p.type])) throw new ForbiddenError();
  const q = query<z.infer<typeof renderQuery>>(req);
  const result = await docs.renderDocument(ctx, p.type, p.refId, { templateId: q.templateId, from: q.from, to: q.to, force: q.force });
  sendPdf(res, result.buffer, result.fileName, q.download);
});
documentsRouter.post('/:type/:refId/email', heavyRateLimit, validate({ params: typeAndId, body: emailInvoiceSchema.extend({ templateId: objectIdSchema.optional() }) }), async (req, res) => {
  const ctx = ctxOf(req);
  const p = params<{ type: DocumentTemplateType; refId: string }>(req);
  if (!hasPermission(ctx, RENDER_PERMISSION[p.type]) || (p.type.startsWith('sale') && !hasPermission(ctx, 'sales.email'))) throw new ForbiddenError();
  ok(res, await docs.emailDocument(ctx, p.type, p.refId, body<{ to?: string; message?: string; templateId?: string }>(req)));
});

/* ---------------------------------------------------------------- share links (WhatsApp / SMS) */
documentsRouter.post('/:type/:refId/share-link', heavyRateLimit, validate({ params: typeAndId, body: z.object({ phone: z.string().trim().max(20).optional(), label: z.string().trim().max(80).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }), async (req, res) => {
  const ctx = ctxOf(req);
  const p = params<{ type: DocumentTemplateType; refId: string }>(req);
  if (!hasPermission(ctx, RENDER_PERMISSION[p.type])) throw new ForbiddenError();
  ok(res, await createShareLink(ctx, p.type, p.refId, body<{ phone?: string; label?: string; from?: Date; to?: Date }>(req)));
});

/** Unauthenticated: streams a PDF for a valid, unexpired share token. Mounted outside the API auth chain. */
export const publicDocumentsRouter = Router();
publicDocumentsRouter.get('/:token', heavyRateLimit, async (req, res) => {
  const result = await renderSharedDocument(String(req.params.token), RENDER_PERMISSION);
  sendPdf(res, result.buffer, result.fileName, false);
});
