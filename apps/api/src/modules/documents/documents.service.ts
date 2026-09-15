import { Types } from 'mongoose';
import {
  DOCUMENT_TEMPLATE_TYPES,
  templateLayoutSchema,
  type CreateTemplateInput,
  type DocumentTemplateType,
  type TemplateDto,
  type TemplateLayout,
  type GeneratedDocumentDto,
} from '@pharmaos/shared';
import { PdfTemplateModel, type PdfTemplateDoc } from '@/models/pdf-template.model';
import { GeneratedDocumentModel, type GeneratedDocumentDoc } from '@/models/generated-document.model';
import { SaleModel } from '@/models/sale.model';
import { OrganizationModel } from '@/models/organization.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter } from '@/lib/scoped';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { audit } from '@/services/audit.service';
import { sendEmail } from '@/services/email/email.service';
import { uploadBuffer } from '@/services/cloudinary.service';
import { logger } from '@/lib/logger';
import { userRefs, isoNow } from '@/modules/common/refs';
import { DEFAULT_LAYOUTS } from './template-defaults';
import { dataFor, sampleData, type DocumentData } from './data-providers';
import { renderPdf } from './pdf-renderer';

const MAX_STORED_PDF_BYTES = 2 * 1024 * 1024;

/** lean() returns BSON Binary for Buffer fields; normalise to a Node Buffer. */
function toBuffer(raw: unknown): Buffer | null {
  if (!raw) return null;
  if (Buffer.isBuffer(raw)) return raw;
  const b = raw as { buffer?: Uint8Array; value?: () => Uint8Array };
  if (b.buffer) return Buffer.from(b.buffer);
  if (typeof b.value === 'function') return Buffer.from(b.value());
  return null;
}

/* ---------------------------------------------------------------- templates */

function toTemplateDto(t: PdfTemplateDoc, who: (id: Types.ObjectId | null | undefined) => { id: string; name: string } | null): TemplateDto {
  return {
    id: String(t._id),
    documentType: t.documentType as DocumentTemplateType,
    name: t.name,
    outletId: t.outletId ? String(t.outletId) : null,
    isDefault: t.isDefault ?? false,
    isSystem: t.isSystem ?? false,
    currentVersion: t.currentVersion ?? 1,
    layout: t.layout as TemplateLayout,
    versions: [...(t.versions ?? [])].sort((a, b) => b.version - a.version).map((v) => ({ id: String(v._id), version: v.version, note: v.note ?? '', createdBy: who(v.createdBy), createdAt: isoNow(v.createdAt) })),
    updatedAt: isoNow(t.updatedAt),
  };
}

/** Ensure every document type has a default template for the organization (idempotent). */
export async function ensureDefaultTemplates(organizationId: Types.ObjectId, userId?: Types.ObjectId): Promise<void> {
  const existing = await PdfTemplateModel.find({ organizationId, isSystem: true }).select('documentType').lean<Pick<PdfTemplateDoc, 'documentType'>[]>();
  const have = new Set(existing.map((e) => e.documentType));
  const missing = DOCUMENT_TEMPLATE_TYPES.filter((t) => !have.has(t));
  if (!missing.length) return;
  await PdfTemplateModel.create(
    missing.map((documentType) => {
      const layout = DEFAULT_LAYOUTS[documentType]();
      return { organizationId, outletId: null, documentType, name: 'Standard', isDefault: true, isSystem: true, currentVersion: 1, layout, versions: [{ version: 1, layout, note: 'System default', createdBy: userId ?? null }], createdBy: userId ?? null };
    }),
  );
}

export async function listTemplates(ctx: RequestContext, documentType?: string) {
  await ensureDefaultTemplates(ctx.organizationId, ctx.userId);
  const docs = await PdfTemplateModel.find(orgFilter<PdfTemplateDoc>(ctx, { status: 'active', ...(documentType ? { documentType } : {}) })).sort({ documentType: 1, isDefault: -1, name: 1 }).lean<PdfTemplateDoc[]>();
  const who = await userRefs(docs.flatMap((d) => d.versions.map((v) => v.createdBy)));
  return docs.map((d) => toTemplateDto(d, who));
}

export async function getTemplate(ctx: RequestContext, id: string) {
  const doc = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { _id: id })).lean<PdfTemplateDoc>();
  if (!doc) throw new NotFoundError('Template');
  const who = await userRefs(doc.versions.map((v) => v.createdBy));
  return toTemplateDto(doc, who);
}

export async function createTemplate(ctx: RequestContext, input: CreateTemplateInput) {
  let layout = input.layout;
  if (input.cloneFromId) {
    const src = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { _id: input.cloneFromId })).lean<PdfTemplateDoc>();
    if (!src) throw new NotFoundError('Template to clone');
    layout = src.layout as TemplateLayout;
  }
  const doc = await PdfTemplateModel.create({
    organizationId: ctx.organizationId,
    outletId: input.outletId ?? null,
    documentType: input.documentType,
    name: input.name,
    isDefault: false,
    isSystem: false,
    currentVersion: 1,
    layout,
    versions: [{ version: 1, layout, note: input.cloneFromId ? 'Duplicated' : 'Created', createdBy: ctx.userId }],
    createdBy: ctx.userId,
  });
  await audit(ctx, { action: 'template.created', entityType: 'PdfTemplate', entityId: doc._id, summary: `Created template "${input.name}" for ${input.documentType}` });
  return getTemplate(ctx, String(doc._id));
}

export async function saveVersion(ctx: RequestContext, id: string, layout: TemplateLayout, note: string) {
  const doc = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Template');
  const parsed = templateLayoutSchema.safeParse(layout);
  if (!parsed.success) throw new ValidationError('Invalid layout', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const next = (doc.currentVersion ?? 1) + 1;
  doc.versions.push({ version: next, layout: parsed.data, note, createdBy: ctx.userId, createdAt: new Date() });
  if (doc.versions.length > 30) doc.versions.splice(0, doc.versions.length - 30);
  doc.currentVersion = next;
  doc.set('layout', parsed.data);
  doc.updatedBy = ctx.userId;
  await doc.save();
  await audit(ctx, { action: 'template.updated', entityType: 'PdfTemplate', entityId: doc._id, summary: `Saved version ${next} of template "${doc.name}"${note ? `: ${note}` : ''}` });
  return getTemplate(ctx, id);
}

export async function restoreVersion(ctx: RequestContext, id: string, version: number) {
  const doc = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { _id: id })).lean<PdfTemplateDoc>();
  if (!doc) throw new NotFoundError('Template');
  const v = doc.versions.find((x) => x.version === version);
  if (!v) throw new NotFoundError('Version');
  return saveVersion(ctx, id, v.layout as TemplateLayout, `Restored version ${version}`);
}

export async function renameTemplate(ctx: RequestContext, id: string, name: string) {
  const doc = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Template');
  doc.name = name;
  await doc.save();
  return getTemplate(ctx, id);
}

export async function setDefaultTemplate(ctx: RequestContext, id: string) {
  const doc = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Template');
  await PdfTemplateModel.updateMany(orgFilter(ctx, { documentType: doc.documentType, outletId: doc.outletId ?? null, _id: { $ne: doc._id } }), { $set: { isDefault: false } });
  doc.isDefault = true;
  await doc.save();
  await audit(ctx, { action: 'template.defaultSet', entityType: 'PdfTemplate', entityId: doc._id, summary: `"${doc.name}" is now the default ${doc.documentType} template${doc.outletId ? ' for this outlet' : ''}` });
  return getTemplate(ctx, id);
}

export async function archiveTemplate(ctx: RequestContext, id: string) {
  const doc = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Template');
  if (doc.isSystem) throw new BusinessRuleError('System templates cannot be deleted; duplicate and customise instead');
  if (doc.isDefault) throw new BusinessRuleError('Set another template as default first');
  doc.status = 'archived';
  await doc.save();
}

/** Pick the template for a document: outlet-specific default → organization default → system. */
export async function resolveTemplate(ctx: RequestContext, documentType: DocumentTemplateType, outletId: Types.ObjectId | null, templateId?: string): Promise<PdfTemplateDoc> {
  await ensureDefaultTemplates(ctx.organizationId, ctx.userId);
  if (templateId) {
    const t = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { _id: templateId, documentType })).lean<PdfTemplateDoc>();
    if (!t) throw new NotFoundError('Template');
    return t;
  }
  if (outletId) {
    const t = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { documentType, outletId, isDefault: true, status: 'active' })).lean<PdfTemplateDoc>();
    if (t) return t;
  }
  const t = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { documentType, outletId: null, isDefault: true, status: 'active' })).lean<PdfTemplateDoc>();
  if (t) return t;
  const sys = await PdfTemplateModel.findOne(orgFilter<PdfTemplateDoc>(ctx, { documentType, isSystem: true })).lean<PdfTemplateDoc>();
  if (!sys) throw new NotFoundError('Template');
  return sys;
}

/* ---------------------------------------------------------------- rendering */

export async function previewTemplate(ctx: RequestContext, documentType: DocumentTemplateType, layout: TemplateLayout, refId?: string): Promise<Buffer> {
  const parsed = templateLayoutSchema.safeParse(layout);
  if (!parsed.success) throw new ValidationError('Invalid layout', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const data = refId ? await dataFor(ctx, documentType, refId) : await sampleData(ctx, documentType);
  return renderPdf(parsed.data, data);
}

export interface RenderResult {
  buffer: Buffer;
  fileName: string;
  document: GeneratedDocumentDoc;
  data: DocumentData;
}

/**
 * Renders a document and records it in history. Re-rendering with the same template version
 * returns the stored PDF so what was printed/emailed can always be reproduced exactly.
 */
export async function renderDocument(ctx: RequestContext, documentType: DocumentTemplateType, refId: string, opts: { templateId?: string; from?: Date; to?: Date; force?: boolean } = {}): Promise<RenderResult> {
  const data = await dataFor(ctx, documentType, refId, opts);
  const template = await resolveTemplate(ctx, documentType, data.outletId, opts.templateId);
  const fileName = `${data.refNumber || documentType}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_');

  if (!opts.force && data.refId) {
    const cached = await GeneratedDocumentModel.findOne(orgFilter<GeneratedDocumentDoc>(ctx, { refType: data.refType, refId: data.refId, documentType, templateId: template._id, templateVersion: template.currentVersion ?? 1 }))
      .select('+pdf')
      .sort({ generatedAt: -1 })
      .lean<GeneratedDocumentDoc & { pdf?: Buffer }>();
    const cachedPdf = toBuffer(cached?.pdf);
    if (cached && cachedPdf && cachedPdf.length > 0) return { buffer: cachedPdf, fileName, document: cached, data };
  }

  const buffer = await renderPdf(template.layout as TemplateLayout, data);
  const attachment = buffer.length > MAX_STORED_PDF_BYTES ? await uploadBuffer(ctx.organizationId, 'documents', buffer, fileName).catch(() => null) : null;
  const doc = await GeneratedDocumentModel.create({
    organizationId: ctx.organizationId,
    outletId: data.outletId,
    documentType,
    refType: data.refType,
    refId: data.refId ?? new Types.ObjectId(),
    refNumber: data.refNumber,
    templateId: template._id,
    templateVersion: template.currentVersion ?? 1,
    fileName,
    bytes: buffer.length,
    pdf: buffer.length <= MAX_STORED_PDF_BYTES ? buffer : undefined,
    attachment,
    generatedBy: ctx.userId,
  } as never);
  return { buffer, fileName, document: (doc as unknown as { toObject(): GeneratedDocumentDoc }).toObject(), data };
}

export async function documentHistory(ctx: RequestContext, refType: string, refId: string): Promise<GeneratedDocumentDto[]> {
  const docs = await GeneratedDocumentModel.find(orgFilter<GeneratedDocumentDoc>(ctx, { refType, refId })).sort({ generatedAt: -1 }).limit(50).lean<GeneratedDocumentDoc[]>();
  const who = await userRefs(docs.map((d) => d.generatedBy));
  return docs.map((d) => ({
    id: String(d._id),
    documentType: d.documentType as DocumentTemplateType,
    refId: String(d.refId),
    refNumber: d.refNumber ?? '',
    templateId: String(d.templateId),
    templateVersion: d.templateVersion,
    fileName: d.fileName,
    bytes: d.bytes ?? 0,
    generatedBy: who(d.generatedBy),
    generatedAt: isoNow(d.generatedAt),
    emails: (d.emails ?? []).map((e) => ({ to: e.to ?? '', status: e.status as 'sent' | 'failed', error: e.error ?? '', sentAt: isoNow(e.sentAt) })),
  }));
}

export async function historicalPdf(ctx: RequestContext, id: string): Promise<{ buffer: Buffer; fileName: string }> {
  const doc = await GeneratedDocumentModel.findOne(orgFilter<GeneratedDocumentDoc>(ctx, { _id: id })).select('+pdf').lean<GeneratedDocumentDoc & { pdf?: Buffer }>();
  const buffer = toBuffer(doc?.pdf);
  if (!doc || !buffer) throw new NotFoundError('Stored document');
  return { buffer, fileName: doc.fileName };
}

/* ---------------------------------------------------------------- email */

function escapeHtml(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Emails a rendered document. Never blocks the originating transaction: callers invoke this after
 * commit (or from the event handler). Delivery status is stored on the document history and, for
 * invoices, on the sale.
 */
export async function emailDocument(ctx: RequestContext, documentType: DocumentTemplateType, refId: string, opts: { to?: string; message?: string; templateId?: string } = {}) {
  const rendered = await renderDocument(ctx, documentType, refId, { templateId: opts.templateId });
  const to = (opts.to || rendered.data.emailTo || '').trim().toLowerCase();
  if (!to) throw new BusinessRuleError('No email address: add one to the customer or enter it now');
  const org = await OrganizationModel.findById(ctx.organizationId).select('name email phone').lean();
  const label = rendered.data.refNumber;
  const subject = `${documentType === 'saleInvoice' || documentType === 'saleReceipt' ? 'Invoice' : documentType === 'paymentReceipt' ? 'Payment receipt' : 'Document'} ${label} from ${org?.name ?? 'your pharmacy'}`;
  const html = `<p>Dear ${escapeHtml(rendered.data.customer?.name || rendered.data.supplier?.name || 'Customer')},</p>
<p>Please find attached ${escapeHtml(subject.toLowerCase())}.${rendered.data.totals.grandTotal ? ` Total: <strong>${escapeHtml(String(rendered.data.totals.grandTotal))}</strong>.` : ''}</p>
${opts.message ? `<p>${escapeHtml(opts.message)}</p>` : ''}
<p>Regards,<br/>${escapeHtml(org?.name ?? '')}${org?.phone ? `<br/>${escapeHtml(org.phone)}` : ''}</p>`;

  let status: 'sent' | 'failed' = 'sent';
  let error = '';
  let messageId = '';
  try {
    const res = await sendEmail({ to: [{ email: to }], subject, html, text: `${subject}. Total ${rendered.data.totals.grandTotal ?? ''}.`, attachments: [{ filename: rendered.fileName, content: rendered.buffer.toString('base64'), contentType: 'application/pdf' }], tags: [documentType], replyTo: org?.email ? { email: org.email, name: org.name } : undefined });
    messageId = res.messageId ?? '';
  } catch (err) {
    status = 'failed';
    error = (err as Error).message.slice(0, 300);
    logger.warn({ err, documentType, refId }, 'document email failed');
  }
  await GeneratedDocumentModel.updateOne({ _id: rendered.document._id } as never, { $push: { emails: { to, status, error, messageId, sentAt: new Date() } } } as never);
  if (rendered.data.refType === 'Sale') {
    await SaleModel.updateOne({ _id: rendered.data.refId, organizationId: ctx.organizationId }, { $set: { 'email.status': status, 'email.to': to, 'email.sentAt': status === 'sent' ? new Date() : null, 'email.error': error, 'email.messageId': messageId } } as never);
  }
  await audit(ctx, { action: status === 'sent' ? 'document.emailed' : 'document.emailFailed', entityType: rendered.data.refType, entityId: rendered.data.refId, summary: `${status === 'sent' ? 'Emailed' : 'Failed to email'} ${label} to ${to}${error ? `: ${error}` : ''}` });
  if (status === 'failed') throw new BusinessRuleError(`Email could not be sent: ${error}`);
  return { to, status, messageId };
}
