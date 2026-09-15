import { z } from 'zod';
import { objectIdSchema } from './common';

/**
 * Document template model. A template is a page (size, margins) with absolutely positioned
 * elements; text elements contain `{{bindings}}` resolved from the document data context;
 * table elements iterate a collection (items, payments, tax summary). Designed for business
 * documents, not free-form graphic design.
 */

export const DOCUMENT_TEMPLATE_TYPES = [
  'saleInvoice',
  'saleReceipt',
  'purchaseInvoice',
  'grn',
  'paymentReceipt',
  'salesReturn',
  'purchaseReturn',
  'customerStatement',
  'supplierStatement',
  'stockTransfer',
  'stockAdjustment',
  'barcodeLabel',
] as const;
export type DocumentTemplateType = (typeof DOCUMENT_TEMPLATE_TYPES)[number];

export const DOCUMENT_TEMPLATE_LABELS: Record<DocumentTemplateType, string> = {
  saleInvoice: 'Sales / Tax invoice (A4)',
  saleReceipt: 'Sales receipt (thermal)',
  purchaseInvoice: 'Purchase invoice',
  grn: 'Goods receipt note',
  paymentReceipt: 'Payment receipt',
  salesReturn: 'Sales return / credit note',
  purchaseReturn: 'Purchase return / debit note',
  customerStatement: 'Customer statement',
  supplierStatement: 'Supplier statement',
  stockTransfer: 'Stock transfer note',
  stockAdjustment: 'Stock adjustment note',
  barcodeLabel: 'Barcode label',
};

export const PAGE_SIZES = ['A4', 'A5', 'letter', 'thermal80', 'thermal58', 'label50x25', 'label38x25'] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** Page dimensions in PDF points (1/72 inch). Thermal/label heights are minimums; content may grow. */
export const PAGE_DIMENSIONS: Record<PageSize, { width: number; height: number; continuous?: boolean }> = {
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  letter: { width: 612, height: 792 },
  thermal80: { width: 226.77, height: 600, continuous: true },
  thermal58: { width: 164.41, height: 600, continuous: true },
  label50x25: { width: 141.73, height: 70.87 },
  label38x25: { width: 107.72, height: 70.87 },
};

export const FONT_FAMILIES = ['Helvetica', 'Times-Roman', 'Courier'] as const;

const styleSchema = z.object({
  fontFamily: z.enum(FONT_FAMILIES).optional(),
  fontSize: z.number().min(4).max(72).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  borderWidth: z.number().min(0).max(5).optional(),
  padding: z.number().min(0).max(40).optional(),
});
export type ElementStyle = z.infer<typeof styleSchema>;

const baseElement = z.object({
  id: z.string().min(1).max(40),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(1),
  height: z.number().min(1),
  style: styleSchema.optional(),
  /** Only render when the binding is truthy (e.g. "customer.gstin", "totals.igstMinor"). */
  visibleWhen: z.string().max(80).optional(),
  locked: z.boolean().optional(),
});

export const tableColumnSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().max(60),
  width: z.number().min(4).max(100),
  align: z.enum(['left', 'center', 'right']).default('left'),
  format: z.enum(['text', 'money', 'qty', 'date', 'percent', 'index']).default('text'),
  visible: z.boolean().default(true),
});

export const templateElementSchema = z.discriminatedUnion('type', [
  baseElement.extend({ type: z.literal('text'), text: z.string().max(4000) }),
  baseElement.extend({ type: z.literal('image'), src: z.enum(['organization.logo', 'custom']), url: z.string().url().max(500).optional(), fit: z.enum(['contain', 'cover']).default('contain') }),
  baseElement.extend({ type: z.literal('line'), orientation: z.enum(['horizontal', 'vertical']).default('horizontal') }),
  baseElement.extend({ type: z.literal('rect') }),
  baseElement.extend({
    type: z.literal('table'),
    collection: z.enum(['items', 'payments', 'taxSummary', 'ledger', 'transferLines', 'adjustmentLines']),
    columns: z.array(tableColumnSchema).min(1).max(16),
    headerStyle: styleSchema.optional(),
    rowStyle: styleSchema.optional(),
    zebra: z.boolean().default(false),
    rowHeight: z.number().min(8).max(60).default(16),
    /** Repeat the header on each page and continue rows below. */
    grow: z.boolean().default(true),
  }),
  baseElement.extend({ type: z.literal('barcode'), value: z.string().max(120), symbology: z.enum(['code128', 'ean13']).default('code128'), showText: z.boolean().default(true) }),
  baseElement.extend({ type: z.literal('qrcode'), value: z.string().max(500) }),
  baseElement.extend({ type: z.literal('pageNumber'), text: z.string().max(60).default('Page {{page}} of {{pages}}') }),
  baseElement.extend({ type: z.literal('signature'), label: z.string().max(80).default('Authorised signatory') }),
]);
export type TemplateElement = z.infer<typeof templateElementSchema>;

export const templateLayoutSchema = z.object({
  pageSize: z.enum(PAGE_SIZES),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  margins: z.object({ top: z.number().min(0).max(100), right: z.number().min(0).max(100), bottom: z.number().min(0).max(100), left: z.number().min(0).max(100) }),
  /** Elements repeated on every page (header/footer band). */
  headerHeight: z.number().min(0).max(400).default(0),
  footerHeight: z.number().min(0).max(300).default(0),
  elements: z.array(templateElementSchema).max(200),
  defaultStyle: styleSchema.optional(),
});
export type TemplateLayout = z.infer<typeof templateLayoutSchema>;

export const createTemplateSchema = z.object({
  documentType: z.enum(DOCUMENT_TEMPLATE_TYPES),
  name: z.string().trim().min(1).max(80),
  outletId: objectIdSchema.nullable().optional(),
  layout: templateLayoutSchema,
  /** Copy layout from an existing template instead of supplying one. */
  cloneFromId: objectIdSchema.optional(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const saveTemplateVersionSchema = z.object({
  layout: templateLayoutSchema,
  note: z.string().trim().max(200).optional().default(''),
});

export const renameTemplateSchema = z.object({ name: z.string().trim().min(1).max(80) });

export interface TemplateVersionDto {
  id: string;
  version: number;
  note: string;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface TemplateDto {
  id: string;
  documentType: DocumentTemplateType;
  name: string;
  outletId: string | null;
  isDefault: boolean;
  isSystem: boolean;
  currentVersion: number;
  layout: TemplateLayout;
  versions: TemplateVersionDto[];
  updatedAt: string;
}

/** Binding catalogue used by the designer palette. */
export interface BindingGroup {
  group: string;
  bindings: { key: string; label: string; format?: 'money' | 'date' | 'qty' | 'percent' }[];
}

export interface GeneratedDocumentDto {
  id: string;
  documentType: DocumentTemplateType;
  refId: string;
  refNumber: string;
  templateId: string;
  templateVersion: number;
  fileName: string;
  bytes: number;
  generatedBy: { id: string; name: string } | null;
  generatedAt: string;
  emails: { to: string; status: 'sent' | 'failed'; error: string; sentAt: string }[];
}
