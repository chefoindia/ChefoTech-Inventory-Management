import type { DocumentTemplateType, TemplateLayout, TemplateElement } from '@pharmaos/shared';

/**
 * Default layouts seeded per organization. Coordinates are PDF points from the page's top-left,
 * inside the margins. Text uses {{bindings}} resolved by data-providers.
 */

const A4 = { width: 595.28, height: 841.89 };
const M = 36;
const CONTENT_W = A4.width - 2 * M; // 523.28

const t = (id: string, x: number, y: number, width: number, height: number, text: string, style: TemplateElement['style'] = {}, extra: Partial<TemplateElement> = {}): TemplateElement =>
  ({ id, type: 'text', x, y, width, height, text, style, ...extra }) as TemplateElement;

function invoiceHeader(title: string): TemplateElement[] {
  return [
    { id: 'logo', type: 'image', src: 'organization.logo', x: 0, y: 0, width: 60, height: 60, fit: 'contain', visibleWhen: 'organization.logoUrl' },
    t('orgName', 70, 0, 300, 18, '{{organization.name}}', { fontSize: 16, bold: true }),
    t('orgAddr', 70, 20, 300, 40, '{{organization.addressLine}}\n{{organization.phone}} · {{organization.email}}', { fontSize: 8, color: '#475569' }),
    t('orgGst', 70, 58, 300, 12, 'GSTIN: {{organization.gstin}} · DL: {{outlet.drugLicenseNo}}', { fontSize: 8, color: '#475569' }),
    t('title', 380, 0, CONTENT_W - 380, 20, title, { fontSize: 16, bold: true, align: 'right' }),
    t('docNo', 380, 24, CONTENT_W - 380, 14, 'No: {{document.number}}', { fontSize: 10, bold: true, align: 'right' }),
    t('docDate', 380, 40, CONTENT_W - 380, 12, 'Date: {{document.date}}', { fontSize: 9, align: 'right' }),
    t('docOutlet', 380, 54, CONTENT_W - 380, 12, 'Outlet: {{outlet.name}}', { fontSize: 9, align: 'right' }),
    { id: 'rule1', type: 'line', x: 0, y: 76, width: CONTENT_W, height: 1, orientation: 'horizontal', style: { borderColor: '#cbd5e1', borderWidth: 1 } },
  ];
}

function partyBlock(label: string, prefix: string, y: number): TemplateElement[] {
  return [
    t(`${prefix}Label`, 0, y, 260, 10, label, { fontSize: 8, bold: true, color: '#64748b' }),
    t(`${prefix}Name`, 0, y + 12, 260, 14, `{{${prefix}.name}}`, { fontSize: 11, bold: true }),
    t(`${prefix}Meta`, 0, y + 27, 260, 30, `{{${prefix}.phone}}\n{{${prefix}.addressLine}}`, { fontSize: 8, color: '#475569' }),
    t(`${prefix}Gst`, 0, y + 58, 260, 10, `GSTIN: {{${prefix}.gstin}}`, { fontSize: 8, color: '#475569' }, { visibleWhen: `${prefix}.gstin` }),
  ];
}

const invoiceItems: TemplateElement = {
  id: 'items',
  type: 'table',
  collection: 'items',
  x: 0,
  y: 160,
  width: CONTENT_W,
  height: 360,
  grow: true,
  zebra: true,
  rowHeight: 16,
  headerStyle: { fontSize: 8, bold: true, background: '#f1f5f9' },
  rowStyle: { fontSize: 8 },
  columns: [
    { key: 'index', label: '#', width: 4, align: 'left', format: 'index', visible: true },
    { key: 'productName', label: 'Item', width: 28, align: 'left', format: 'text', visible: true },
    { key: 'hsnCode', label: 'HSN', width: 8, align: 'left', format: 'text', visible: true },
    { key: 'batchNumber', label: 'Batch', width: 10, align: 'left', format: 'text', visible: true },
    { key: 'expiry', label: 'Exp', width: 8, align: 'left', format: 'text', visible: true },
    { key: 'qtyLabel', label: 'Qty', width: 8, align: 'right', format: 'text', visible: true },
    { key: 'mrp', label: 'MRP', width: 8, align: 'right', format: 'money', visible: true },
    { key: 'rate', label: 'Rate', width: 8, align: 'right', format: 'money', visible: true },
    { key: 'discount', label: 'Disc', width: 6, align: 'right', format: 'money', visible: true },
    { key: 'taxRate', label: 'GST%', width: 5, align: 'right', format: 'percent', visible: true },
    { key: 'amount', label: 'Amount', width: 7, align: 'right', format: 'money', visible: true },
  ],
};

function totalsBlock(y: number, includeTax = true): TemplateElement[] {
  const x = CONTENT_W - 200;
  const rows: [string, string, string?][] = [
    ['Subtotal', '{{totals.subtotal}}'],
    ['Discount', '{{totals.discount}}', 'totals.discountMinor'],
    ['Taxable', '{{totals.taxable}}'],
    ['CGST', '{{totals.cgst}}', 'totals.cgstMinor'],
    ['SGST', '{{totals.sgst}}', 'totals.sgstMinor'],
    ['IGST', '{{totals.igst}}', 'totals.igstMinor'],
    ['Round off', '{{totals.roundOff}}', 'totals.roundOffMinor'],
  ];
  const out: TemplateElement[] = [];
  let cy = y;
  for (const [label, val, cond] of rows) {
    if (!includeTax && ['CGST', 'SGST', 'IGST', 'Taxable'].includes(label)) continue;
    out.push(t(`tot_${label}`, x, cy, 110, 12, label, { fontSize: 9, color: '#475569' }, cond ? { visibleWhen: cond } : {}));
    out.push(t(`totv_${label}`, x + 110, cy, 90, 12, val, { fontSize: 9, align: 'right' }, cond ? { visibleWhen: cond } : {}));
    cy += 13;
  }
  out.push({ id: 'totRule', type: 'line', x, y: cy + 2, width: 200, height: 1, orientation: 'horizontal', style: { borderColor: '#0f172a', borderWidth: 1 } });
  out.push(t('grandLabel', x, cy + 6, 110, 16, 'Grand total (Rs.)', { fontSize: 11, bold: true }));
  out.push(t('grandValue', x + 110, cy + 6, 90, 16, '{{totals.grandTotal}}', { fontSize: 11, bold: true, align: 'right' }));
  out.push(t('words', 0, y, 300, 30, 'Amount in words: {{totals.grandTotalWords}}', { fontSize: 8, italic: true, color: '#475569' }));
  return out;
}

const taxSummary: TemplateElement = {
  id: 'taxSummary',
  type: 'table',
  collection: 'taxSummary',
  x: 0,
  y: 560,
  width: 300,
  height: 70,
  grow: false,
  zebra: false,
  rowHeight: 14,
  headerStyle: { fontSize: 7, bold: true, background: '#f1f5f9' },
  rowStyle: { fontSize: 7 },
  columns: [
    { key: 'rate', label: 'GST', width: 20, align: 'left', format: 'percent', visible: true },
    { key: 'taxable', label: 'Taxable', width: 25, align: 'right', format: 'money', visible: true },
    { key: 'cgst', label: 'CGST', width: 18, align: 'right', format: 'money', visible: true },
    { key: 'sgst', label: 'SGST', width: 18, align: 'right', format: 'money', visible: true },
    { key: 'igst', label: 'IGST', width: 19, align: 'right', format: 'money', visible: true },
  ],
};

function footer(): TemplateElement[] {
  return [
    t('terms', 0, 0, 320, 40, '{{outlet.invoiceFooterNote}}', { fontSize: 7, color: '#64748b' }),
    { id: 'sig', type: 'signature', x: CONTENT_W - 160, y: 0, width: 160, height: 40, label: 'For {{organization.name}}' },
    { id: 'pageNo', type: 'pageNumber', x: 0, y: 44, width: CONTENT_W, height: 10, text: 'Page {{page}} of {{pages}}', style: { fontSize: 7, align: 'center', color: '#94a3b8' } },
  ];
}

const a4Base = (elements: TemplateElement[]): TemplateLayout => ({
  pageSize: 'A4',
  orientation: 'portrait',
  margins: { top: M, right: M, bottom: M, left: M },
  headerHeight: 0,
  footerHeight: 56,
  elements,
  defaultStyle: { fontFamily: 'Helvetica', fontSize: 9, color: '#0f172a' },
});

export function saleInvoiceLayout(): TemplateLayout {
  return a4Base([
    ...invoiceHeader('TAX INVOICE'),
    ...partyBlock('BILL TO', 'customer', 86),
    t('payLabel', 300, 86, 220, 10, 'PAYMENT', { fontSize: 8, bold: true, color: '#64748b' }),
    t('payMeta', 300, 98, 220, 40, 'Paid: {{document.paid}} ({{document.paymentMethods}})\nBalance: {{document.balance}}\nDue: {{document.dueDate}}', { fontSize: 8 }),
    t('rx', 300, 140, 220, 12, 'Prescribed by: {{document.doctorName}}', { fontSize: 8 }, { visibleWhen: 'document.doctorName' }),
    invoiceItems,
    ...totalsBlock(530),
    taxSummary,
    ...footer().map((e) => ({ ...e, y: e.y + 660 })),
  ]);
}

export function saleReceiptLayout(): TemplateLayout {
  const W = 226.77 - 16;
  return {
    pageSize: 'thermal80',
    orientation: 'portrait',
    margins: { top: 8, right: 8, bottom: 8, left: 8 },
    headerHeight: 0,
    footerHeight: 0,
    defaultStyle: { fontFamily: 'Helvetica', fontSize: 8, color: '#000000' },
    elements: [
      t('orgName', 0, 0, W, 14, '{{organization.name}}', { fontSize: 11, bold: true, align: 'center' }),
      t('orgAddr', 0, 15, W, 24, '{{outlet.addressLine}}\nPh: {{outlet.phone}} · GSTIN {{organization.gstin}}', { fontSize: 6.5, align: 'center' }),
      t('docNo', 0, 42, W, 10, 'Invoice {{document.number}} · {{document.dateTime}}', { fontSize: 7, align: 'center', bold: true }),
      t('cust', 0, 54, W, 10, 'Customer: {{customer.name}} {{customer.phone}}', { fontSize: 7 }),
      {
        id: 'items',
        type: 'table',
        collection: 'items',
        x: 0,
        y: 68,
        width: W,
        height: 200,
        grow: true,
        zebra: false,
        rowHeight: 12,
        headerStyle: { fontSize: 6.5, bold: true },
        rowStyle: { fontSize: 6.5 },
        columns: [
          { key: 'productName', label: 'Item', width: 44, align: 'left', format: 'text', visible: true },
          { key: 'qtyLabel', label: 'Qty', width: 14, align: 'right', format: 'text', visible: true },
          { key: 'rate', label: 'Rate', width: 20, align: 'right', format: 'money', visible: true },
          { key: 'amount', label: 'Amt', width: 22, align: 'right', format: 'money', visible: true },
        ],
      },
      t('sub', 0, 280, W, 10, 'Subtotal {{totals.subtotal}} · Disc {{totals.discount}} · GST {{totals.tax}}', { fontSize: 6.5, align: 'right' }),
      t('grand', 0, 292, W, 14, 'TOTAL {{totals.grandTotal}}', { fontSize: 11, bold: true, align: 'right' }),
      t('paid', 0, 308, W, 10, 'Paid {{document.paid}} ({{document.paymentMethods}}) · Balance {{document.balance}}', { fontSize: 6.5, align: 'right' }),
      t('thanks', 0, 324, W, 10, 'Thank you for your purchase', { fontSize: 7, align: 'center', italic: true }),
      t('foot', 0, 336, W, 20, '{{outlet.invoiceFooterNote}}', { fontSize: 6, align: 'center', color: '#333333' }),
    ],
  };
}

export function purchaseInvoiceLayout(): TemplateLayout {
  return a4Base([
    ...invoiceHeader('PURCHASE INVOICE'),
    ...partyBlock('SUPPLIER', 'supplier', 86),
    t('supInv', 300, 86, 220, 40, 'Supplier invoice: {{document.supplierInvoiceNumber}}\nInvoice date: {{document.invoiceDate}}\nDue: {{document.dueDate}}', { fontSize: 8 }),
    { ...invoiceItems, columns: invoiceItems.type === 'table' ? invoiceItems.columns.map((c) => (c.key === 'mrp' ? { ...c, label: 'MRP' } : c.key === 'rate' ? { ...c, label: 'Cost' } : c)) : [] } as TemplateElement,
    ...totalsBlock(530),
    taxSummary,
    ...footer().map((e) => ({ ...e, y: e.y + 660 })),
  ]);
}

export function grnLayout(): TemplateLayout {
  return a4Base([
    ...invoiceHeader('GOODS RECEIPT NOTE'),
    ...partyBlock('SUPPLIER', 'supplier', 86),
    t('ref', 300, 86, 220, 30, 'Purchase: {{document.purchaseNumber}}\nReceived: {{document.date}}', { fontSize: 8 }),
    {
      id: 'items',
      type: 'table',
      collection: 'items',
      x: 0,
      y: 160,
      width: CONTENT_W,
      height: 420,
      grow: true,
      zebra: true,
      rowHeight: 16,
      headerStyle: { fontSize: 8, bold: true, background: '#f1f5f9' },
      rowStyle: { fontSize: 8 },
      columns: [
        { key: 'index', label: '#', width: 4, align: 'left', format: 'index', visible: true },
        { key: 'productName', label: 'Item', width: 30, align: 'left', format: 'text', visible: true },
        { key: 'batchNumber', label: 'Batch', width: 12, align: 'left', format: 'text', visible: true },
        { key: 'expiry', label: 'Expiry', width: 10, align: 'left', format: 'text', visible: true },
        { key: 'ordered', label: 'Ordered', width: 10, align: 'right', format: 'text', visible: true },
        { key: 'received', label: 'Received', width: 10, align: 'right', format: 'text', visible: true },
        { key: 'free', label: 'Free', width: 8, align: 'right', format: 'text', visible: true },
        { key: 'damaged', label: 'Damaged', width: 8, align: 'right', format: 'text', visible: true },
        { key: 'mrp', label: 'MRP', width: 8, align: 'right', format: 'money', visible: true },
      ],
    },
    ...footer().map((e) => ({ ...e, y: e.y + 660 })),
  ]);
}

export function paymentReceiptLayout(): TemplateLayout {
  return {
    ...a4Base([
      ...invoiceHeader('PAYMENT RECEIPT'),
      ...partyBlock('RECEIVED FROM', 'customer', 86),
      t('amt', 300, 86, 220, 60, 'Amount: {{document.amount}}\nMethod: {{document.method}}\nReference: {{document.reference}}\nDate: {{document.date}}', { fontSize: 9 }),
      t('words', 0, 160, CONTENT_W, 14, 'Amount in words: {{document.amountWords}}', { fontSize: 9, italic: true }),
      {
        id: 'alloc',
        type: 'table',
        collection: 'items',
        x: 0,
        y: 184,
        width: 320,
        height: 150,
        grow: true,
        zebra: true,
        rowHeight: 16,
        headerStyle: { fontSize: 8, bold: true, background: '#f1f5f9' },
        rowStyle: { fontSize: 8 },
        columns: [
          { key: 'documentNumber', label: 'Invoice', width: 50, align: 'left', format: 'text', visible: true },
          { key: 'amount', label: 'Applied', width: 50, align: 'right', format: 'money', visible: true },
        ],
      },
      t('bal', 0, 350, 320, 12, 'Balance after this payment: {{document.balanceAfter}}', { fontSize: 9, bold: true }),
      ...footer().map((e) => ({ ...e, y: e.y + 400 })),
    ]),
    pageSize: 'A5',
    footerHeight: 0,
  };
}

export function returnLayout(title: string, partyPrefix: 'customer' | 'supplier'): TemplateLayout {
  return a4Base([
    ...invoiceHeader(title),
    ...partyBlock(partyPrefix === 'customer' ? 'CUSTOMER' : 'SUPPLIER', partyPrefix, 86),
    t('ref', 300, 86, 220, 30, 'Against: {{document.referenceNumber}}\nSettlement: {{document.settlement}}', { fontSize: 8 }),
    invoiceItems,
    ...totalsBlock(530),
    taxSummary,
    ...footer().map((e) => ({ ...e, y: e.y + 660 })),
  ]);
}

export function statementLayout(title: string, partyPrefix: 'customer' | 'supplier'): TemplateLayout {
  return a4Base([
    ...invoiceHeader(title),
    ...partyBlock(partyPrefix === 'customer' ? 'CUSTOMER' : 'SUPPLIER', partyPrefix, 86),
    t('period', 300, 86, 220, 30, 'Period: {{document.periodFrom}} to {{document.periodTo}}\nClosing balance: {{document.closingBalance}}', { fontSize: 9, bold: true }),
    {
      id: 'ledger',
      type: 'table',
      collection: 'ledger',
      x: 0,
      y: 160,
      width: CONTENT_W,
      height: 480,
      grow: true,
      zebra: true,
      rowHeight: 16,
      headerStyle: { fontSize: 8, bold: true, background: '#f1f5f9' },
      rowStyle: { fontSize: 8 },
      columns: [
        { key: 'date', label: 'Date', width: 14, align: 'left', format: 'text', visible: true },
        { key: 'type', label: 'Type', width: 14, align: 'left', format: 'text', visible: true },
        { key: 'refNumber', label: 'Reference', width: 20, align: 'left', format: 'text', visible: true },
        { key: 'note', label: 'Note', width: 22, align: 'left', format: 'text', visible: true },
        { key: 'debit', label: 'Debit', width: 10, align: 'right', format: 'money', visible: true },
        { key: 'credit', label: 'Credit', width: 10, align: 'right', format: 'money', visible: true },
        { key: 'balance', label: 'Balance', width: 10, align: 'right', format: 'money', visible: true },
      ],
    },
    ...footer().map((e) => ({ ...e, y: e.y + 660 })),
  ]);
}

export function transferLayout(): TemplateLayout {
  return a4Base([
    ...invoiceHeader('STOCK TRANSFER NOTE'),
    t('from', 0, 86, 250, 40, 'FROM\n{{document.fromOutlet}}', { fontSize: 9 }),
    t('to', 270, 86, 250, 40, 'TO\n{{document.toOutlet}}', { fontSize: 9 }),
    t('st', 0, 130, 500, 12, 'Status: {{document.status}} · Requested {{document.requestedAt}} · Dispatched {{document.dispatchedAt}} · Received {{document.receivedAt}}', { fontSize: 8, color: '#475569' }),
    {
      id: 'lines',
      type: 'table',
      collection: 'transferLines',
      x: 0,
      y: 160,
      width: CONTENT_W,
      height: 460,
      grow: true,
      zebra: true,
      rowHeight: 16,
      headerStyle: { fontSize: 8, bold: true, background: '#f1f5f9' },
      rowStyle: { fontSize: 8 },
      columns: [
        { key: 'index', label: '#', width: 5, align: 'left', format: 'index', visible: true },
        { key: 'productName', label: 'Item', width: 35, align: 'left', format: 'text', visible: true },
        { key: 'batchNumber', label: 'Batch', width: 15, align: 'left', format: 'text', visible: true },
        { key: 'expiry', label: 'Expiry', width: 12, align: 'left', format: 'text', visible: true },
        { key: 'requested', label: 'Requested', width: 11, align: 'right', format: 'text', visible: true },
        { key: 'dispatched', label: 'Dispatched', width: 11, align: 'right', format: 'text', visible: true },
        { key: 'received', label: 'Received', width: 11, align: 'right', format: 'text', visible: true },
      ],
    },
    ...footer().map((e) => ({ ...e, y: e.y + 660 })),
  ]);
}

export function adjustmentLayout(): TemplateLayout {
  return a4Base([
    ...invoiceHeader('STOCK ADJUSTMENT'),
    t('meta', 0, 86, 500, 40, 'Type: {{document.type}} · Reason: {{document.reason}} · Status: {{document.status}}\nRequested by {{document.requestedBy}} · Approved by {{document.approvedBy}}', { fontSize: 9 }),
    {
      id: 'lines',
      type: 'table',
      collection: 'adjustmentLines',
      x: 0,
      y: 140,
      width: CONTENT_W,
      height: 480,
      grow: true,
      zebra: true,
      rowHeight: 16,
      headerStyle: { fontSize: 8, bold: true, background: '#f1f5f9' },
      rowStyle: { fontSize: 8 },
      columns: [
        { key: 'index', label: '#', width: 5, align: 'left', format: 'index', visible: true },
        { key: 'productName', label: 'Item', width: 40, align: 'left', format: 'text', visible: true },
        { key: 'batchNumber', label: 'Batch', width: 15, align: 'left', format: 'text', visible: true },
        { key: 'qty', label: 'Change', width: 15, align: 'right', format: 'text', visible: true },
        { key: 'value', label: 'Value', width: 12, align: 'right', format: 'money', visible: true },
        { key: 'note', label: 'Note', width: 13, align: 'left', format: 'text', visible: true },
      ],
    },
    ...footer().map((e) => ({ ...e, y: e.y + 660 })),
  ]);
}

export function barcodeLabelLayout(): TemplateLayout {
  return {
    pageSize: 'label50x25',
    orientation: 'portrait',
    margins: { top: 3, right: 3, bottom: 3, left: 3 },
    headerHeight: 0,
    footerHeight: 0,
    defaultStyle: { fontFamily: 'Helvetica', fontSize: 6, color: '#000000' },
    elements: [
      t('name', 0, 0, 135, 8, '{{product.name}}', { fontSize: 6, bold: true }),
      { id: 'bc', type: 'barcode', x: 0, y: 10, width: 135, height: 36, value: '{{product.barcode}}', symbology: 'code128', showText: true },
      t('price', 0, 48, 135, 8, 'MRP {{product.mrp}} · {{organization.name}}', { fontSize: 5.5 }),
    ],
  };
}

export const DEFAULT_LAYOUTS: Record<DocumentTemplateType, () => TemplateLayout> = {
  saleInvoice: saleInvoiceLayout,
  saleReceipt: saleReceiptLayout,
  purchaseInvoice: purchaseInvoiceLayout,
  grn: grnLayout,
  paymentReceipt: paymentReceiptLayout,
  salesReturn: () => returnLayout('CREDIT NOTE / SALES RETURN', 'customer'),
  purchaseReturn: () => returnLayout('DEBIT NOTE / PURCHASE RETURN', 'supplier'),
  customerStatement: () => statementLayout('STATEMENT OF ACCOUNT', 'customer'),
  supplierStatement: () => statementLayout('SUPPLIER STATEMENT', 'supplier'),
  stockTransfer: transferLayout,
  stockAdjustment: adjustmentLayout,
  barcodeLabel: barcodeLabelLayout,
};
