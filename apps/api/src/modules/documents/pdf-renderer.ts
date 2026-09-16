import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import QRCode from 'qrcode';
import { PAGE_DIMENSIONS, formatMoney, type TemplateLayout, type TemplateElement, type ElementStyle } from '@pharmaos/shared';
import type { DocumentData } from './data-providers';
import { logger } from '@/lib/logger';

/**
 * Renders a template layout + data context to a PDF buffer using pdfkit.
 * - Elements are absolutely positioned inside the margins.
 * - `{{path}}` bindings are resolved against the data context.
 * - Tables with `grow` paginate: rows continue on new pages below the header band; elements
 *   positioned below a growing table are pushed down by the table's extra height.
 * - Continuous page sizes (thermal) grow the page to fit content.
 */

type Row = Record<string, string | number>;

function get(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), data);
}

export function interpolate(text: string, data: DocumentData, extra: Record<string, unknown> = {}): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => {
    const v = path in extra ? extra[path] : get(data, path);
    return v === undefined || v === null ? '' : String(v);
  });
}

function truthy(data: DocumentData, path?: string): boolean {
  if (!path) return true;
  const v = get(data, path);
  return !(v === undefined || v === null || v === '' || v === 0 || v === false);
}

function fontName(style: ElementStyle): string {
  const family = style.fontFamily ?? 'Helvetica';
  if (family === 'Helvetica') return style.bold && style.italic ? 'Helvetica-BoldOblique' : style.bold ? 'Helvetica-Bold' : style.italic ? 'Helvetica-Oblique' : 'Helvetica';
  if (family === 'Times-Roman') return style.bold && style.italic ? 'Times-BoldItalic' : style.bold ? 'Times-Bold' : style.italic ? 'Times-Italic' : 'Times-Roman';
  return style.bold && style.italic ? 'Courier-BoldOblique' : style.bold ? 'Courier-Bold' : style.italic ? 'Courier-Oblique' : 'Courier';
}

function formatCell(value: unknown, format: string, index: number): string {
  if (format === 'index') return String(index + 1);
  if (value === undefined || value === null) return '';
  if (format === 'money') return typeof value === 'number' ? formatMoney(value) : String(value);
  if (format === 'percent') return typeof value === 'number' ? `${value}%` : String(value);
  if (format === 'qty') return typeof value === 'number' ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : String(value);
  return String(value);
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!/image\/(png|jpeg|jpg)/.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 4 * 1024 * 1024 ? null : buf;
  } catch {
    return null;
  }
}

export async function renderPdf(layout: TemplateLayout, data: DocumentData): Promise<Buffer> {
  const dims = PAGE_DIMENSIONS[layout.pageSize];
  const landscape = layout.orientation === 'landscape';
  const pageW = landscape ? dims.height : dims.width;
  const contentW = pageW - layout.margins.left - layout.margins.right;
  const def: ElementStyle = { fontFamily: 'Helvetica', fontSize: 9, color: '#0f172a', ...(layout.defaultStyle ?? {}) };

  // Pre-fetch images and pre-render barcodes so drawing is synchronous.
  const images = new Map<string, Buffer>();
  const codes = new Map<string, Buffer>();
  for (const el of layout.elements) {
    if (el.type === 'image') {
      const url = el.src === 'organization.logo' ? data.organization.logoUrl : el.url;
      if (url) {
        const buf = await fetchImage(url);
        if (buf) images.set(el.id, buf);
      }
    } else if (el.type === 'barcode') {
      const value = interpolate(el.value, data);
      if (value) {
        try {
          const png = await bwipjs.toBuffer({ bcid: el.symbology === 'ean13' && /^\d{13}$/.test(value) ? 'ean13' : 'code128', text: value, scale: 3, height: 10, includetext: el.showText, textxalign: 'center' });
          codes.set(el.id, png);
        } catch (err) {
          logger.warn({ err, value }, 'barcode render failed');
        }
      }
    } else if (el.type === 'qrcode') {
      const value = interpolate(el.value, data);
      if (value) codes.set(el.id, await QRCode.toBuffer(value, { margin: 0, width: 300 }));
    }
  }

  // For continuous (thermal) pages, compute the needed height first by measuring growth.
  const tables = layout.elements.filter((e): e is Extract<TemplateElement, { type: 'table' }> => e.type === 'table');
  const tableGrowth = new Map<string, number>();
  for (const tbl of tables) {
    const rows = (data[tbl.collection] as Row[]) ?? [];
    const needed = tbl.rowHeight * (rows.length + 1) + 4;
    tableGrowth.set(tbl.id, Math.max(0, needed - tbl.height));
  }
  const totalGrowth = [...tableGrowth.values()].reduce((a, b) => a + b, 0);
  const baseH = landscape ? dims.width : dims.height;
  const contentBottom = Math.max(...layout.elements.map((e) => e.y + e.height), 0);
  const pageH = dims.continuous ? Math.max(120, layout.margins.top + layout.margins.bottom + contentBottom + totalGrowth + 8) : baseH;

  const doc = new PDFDocument({ size: [pageW, pageH], margin: 0, autoFirstPage: true, bufferPages: true, info: { Title: data.refNumber, Author: data.organization.name, Creator: 'PharmaOS by ChefoTech' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const ox = layout.margins.left;
  const oy = layout.margins.top;
  const usableH = pageH - layout.margins.top - layout.margins.bottom;
  const footerY = usableH - layout.footerHeight; // footer band starts here (relative to margins)

  const applyStyle = (style: ElementStyle) => {
    doc.font(fontName({ ...def, ...style })).fontSize(style.fontSize ?? def.fontSize ?? 9).fillColor(style.color ?? def.color ?? '#000000');
  };

  const drawBox = (x: number, y: number, w: number, h: number, style: ElementStyle) => {
    if (style.background) doc.save().rect(ox + x, oy + y, w, h).fill(style.background).restore();
    if (style.borderWidth) doc.save().lineWidth(style.borderWidth).strokeColor(style.borderColor ?? '#000000').rect(ox + x, oy + y, w, h).stroke().restore();
  };

  const drawText = (text: string, x: number, y: number, w: number, h: number, style: ElementStyle) => {
    if (!text) return;
    applyStyle(style);
    const pad = style.padding ?? 0;
    doc.text(text, ox + x + pad, oy + y + pad, { width: Math.max(1, w - pad * 2), height: Math.max(1, h - pad * 2), align: style.align ?? 'left', lineGap: style.lineHeight ? (style.lineHeight - 1) * (style.fontSize ?? 9) : 0, ellipsis: true });
  };

  // Elements in the footer band + page numbers are drawn on every page.
  const pageNumberElements = layout.elements.filter((e) => e.type === 'pageNumber');
  const footerElements = layout.elements.filter((e) => e.type !== 'pageNumber' && e.type !== 'table' && e.y >= footerY);
  const headerElements = layout.elements.filter((e) => e.type !== 'pageNumber' && e.type !== 'table' && e.y < layout.headerHeight);
  let pageCount = 1;

  const drawStatic = (el: TemplateElement, shiftY = 0) => {
    if (!truthy(data, el.visibleWhen)) return;
    const style = { ...def, ...(el.style ?? {}) };
    const y = el.y + shiftY;
    switch (el.type) {
      case 'text':
        drawBox(el.x, y, el.width, el.height, style);
        drawText(interpolate(el.text, data), el.x, y, el.width, el.height, style);
        break;
      case 'rect':
        drawBox(el.x, y, el.width, el.height, { borderWidth: style.borderWidth ?? 1, ...style });
        break;
      case 'line':
        doc.save().lineWidth(style.borderWidth ?? 1).strokeColor(style.borderColor ?? '#000000');
        if (el.orientation === 'vertical') doc.moveTo(ox + el.x, oy + y).lineTo(ox + el.x, oy + y + el.height).stroke();
        else doc.moveTo(ox + el.x, oy + y).lineTo(ox + el.x + el.width, oy + y).stroke();
        doc.restore();
        break;
      case 'image': {
        const buf = images.get(el.id);
        if (buf) doc.image(buf, ox + el.x, oy + y, { fit: [el.width, el.height], align: 'center', valign: 'center' });
        break;
      }
      case 'barcode':
      case 'qrcode': {
        const buf = codes.get(el.id);
        if (buf) doc.image(buf, ox + el.x, oy + y, { fit: [el.width, el.height], align: 'center', valign: 'center' });
        break;
      }
      case 'signature':
        doc.save().lineWidth(0.5).strokeColor('#94a3b8').moveTo(ox + el.x, oy + y + el.height - 14).lineTo(ox + el.x + el.width, oy + y + el.height - 14).stroke().restore();
        drawText(interpolate(el.label, data), el.x, y + el.height - 12, el.width, 12, { ...style, fontSize: style.fontSize ?? 7, align: 'center' });
        break;
      default:
        break;
    }
  };

  const drawPageChrome = (page: number, pages: number) => {
    for (const el of headerElements) drawStatic(el);
    for (const el of footerElements) drawStatic(el);
    for (const el of pageNumberElements) {
      if (el.type !== 'pageNumber') continue;
      drawText(interpolate(el.text, data, { page, pages }), el.x, el.y, el.width, el.height, { ...def, ...(el.style ?? {}) });
    }
  };

  // Two-pass: render into pages, counting them, then stamp page numbers (pdfkit supports bufferPages).
  doc.on('pageAdded', () => {
    pageCount += 1;
  });

  // Body: everything that is not header/footer/pageNumber, in y order; tables may grow and push later elements.
  const body = layout.elements
    .filter((e) => e.type !== 'pageNumber' && !(e.type !== 'table' && (e.y >= footerY || e.y < layout.headerHeight)))
    .sort((a, b) => a.y - b.y);

  let shift = 0;
  let pagesRendered: (() => void)[] = [];
  void pagesRendered;

  const newPage = () => {
    doc.addPage({ size: [pageW, pageH], margin: 0 });
  };

  for (const el of body) {
    if (el.type !== 'table') {
      let y = el.y + shift;
      if (!dims.continuous && y + el.height > footerY && y > layout.headerHeight) {
        newPage();
        shift -= y - layout.headerHeight - 4;
        y = el.y + shift;
      }
      drawStatic(el, shift);
      continue;
    }
    if (!truthy(data, el.visibleWhen)) continue;
    const rows = (data[el.collection] as Row[]) ?? [];
    const cols = el.columns.filter((c) => c.visible);
    const totalWidth = cols.reduce((s, c) => s + c.width, 0) || 1;
    const colW = cols.map((c) => (c.width / totalWidth) * el.width);
    const headStyle = { ...def, ...(el.headerStyle ?? {}) };
    const rowStyle = { ...def, ...(el.rowStyle ?? {}) };
    const rh = el.rowHeight;
    let y = el.y + shift;

    const drawHeader = () => {
      drawBox(el.x, y, el.width, rh, { background: headStyle.background ?? '#f1f5f9', borderColor: '#cbd5e1', borderWidth: 0.5 });
      let cx = el.x;
      cols.forEach((c, i) => {
        drawText(c.label, cx, y + 2, colW[i]!, rh - 2, { ...headStyle, align: c.align, padding: 2 });
        cx += colW[i]!;
      });
      y += rh;
    };

    drawHeader();
    rows.forEach((row, idx) => {
      if (!dims.continuous && el.grow && y + rh > footerY) {
        newPage();
        y = layout.headerHeight + 4;
        drawHeader();
      }
      if (!el.grow && y + rh > el.y + shift + el.height) return;
      if (el.zebra && idx % 2 === 1) drawBox(el.x, y, el.width, rh, { background: '#f8fafc' });
      let cx = el.x;
      cols.forEach((c, i) => {
        drawText(formatCell(row[c.key], c.format, idx), cx, y + 2, colW[i]!, rh - 2, { ...rowStyle, align: c.align, padding: 2 });
        cx += colW[i]!;
      });
      doc.save().lineWidth(0.3).strokeColor('#e2e8f0').moveTo(ox + el.x, oy + y + rh).lineTo(ox + el.x + el.width, oy + y + rh).stroke().restore();
      y += rh;
    });
    const used = y - (el.y + shift);
    if (el.grow && used > el.height) shift += used - el.height;
    // A page break inside the table moves the shift baseline: later elements follow the table end.
    const naturalEnd = el.y + shift + el.height;
    if (y > naturalEnd) shift += y - naturalEnd;
  }

  // Page chrome (header/footer/page numbers) on every buffered page.
  const range = doc.bufferedPageRange();
  const pages = range.count || pageCount;
  for (let i = 0; i < pages; i += 1) {
    doc.switchToPage(i);
    drawPageChrome(i + 1, pages);
  }
  doc.end();
  return done;
}
