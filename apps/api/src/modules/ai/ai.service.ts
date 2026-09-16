import type { AiChatInput, AiChatReply, AiAction, AiExtractedInvoice, AiExtractedPrescription, AttachmentRef } from '@pharmaos/shared';
import type { RequestContext } from '@/lib/context';
import { hasPermission } from '@/lib/context';
import { BusinessRuleError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { audit } from '@/services/audit.service';
import { attachmentUrl } from '@/services/cloudinary.service';
import { AiProviderError, type AiMessage, type AiInlineFile } from '@/services/ai/provider';
import { searchProducts } from '@/modules/catalog/products.service';
import { listSuppliers } from '@/modules/parties/suppliers.service';
import { resolveAi, recordUsage } from './ai-settings.service';
import { toolsFor } from './tools';

const MAX_TOOL_ROUNDS = 6;

/* ---------------------------------------------------------------- prompts */

const PAGE_GUIDE: Record<string, string> = {
  '/dashboard': 'Dashboard: today\'s sales, purchases, outstanding money, low stock, expiry and quick actions.',
  '/sales/pos': 'POS (billing counter). Search or scan a medicine, set quantity and unit (strip/tablet), pick customer, take payment (cash/UPI/card, split), or credit (Baki) for saved customers. F12 completes the bill; F9 holds it. Schedule H/H1/X items need a doctor name or prescription.',
  '/sales': 'Sales list: invoices, returns, collections and held bills. Open an invoice to print, email, return items or cancel.',
  '/purchases': 'Purchases: supplier invoices, goods receipts (GRN), returns and supplier payments.',
  '/purchases/new': 'New purchase: enter the supplier bill line by line (product, unit, qty, free qty, batch, expiry, rate, MRP, GST). "Receive now" adds stock immediately; otherwise stock arrives through a GRN later.',
  '/purchases/grn': 'GRN (Goods Received Note): confirm what physically arrived against the purchase; only confirmed quantities become sellable stock. Short or damaged items stay pending.',
  '/products': 'Product catalogue: name, generic, units (base unit like tablet, pack units like strip), MRP, GST, schedule, barcodes, reorder level.',
  '/inventory': 'Inventory: stock overview, batches (edit/block/write-off), expiry buckets, low stock, movements ledger, adjustments with approval, transfers between outlets.',
  '/customers': 'Customers: profile, credit limit, Baki (outstanding), ledger, statements, invoices, prescriptions, documents.',
  '/suppliers': 'Suppliers: GST details, payment terms, payables, ledger, purchases, returns.',
  '/prescriptions': 'Prescriptions: doctor, medicines, scan attachments; link to schedule-H sales.',
  '/reports': 'Reports: 33 reports (sales, purchases, inventory, finance, GST/HSN, pharmacy registers) with date filters and CSV/Excel export.',
  '/notifications': 'Notification centre: low stock, expiry, credit due, approvals, system events. Rules live in Settings → Notifications.',
  '/settings': 'Settings: organization & tax, outlets, users & roles, categories & units, custom fields, document templates, notifications, import/export, subscription, AI.',
};

function guideFor(page?: string): string {
  if (!page) return '';
  const key = Object.keys(PAGE_GUIDE).filter((k) => page.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return key ? PAGE_GUIDE[key]! : '';
}

function systemPrompt(ctx: RequestContext, input: AiChatInput, language: string, features: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const ctxLines: string[] = [];
  if (input.context?.page) ctxLines.push(`Current page: ${input.context.page}${input.context.title ? ` (${input.context.title})` : ''}. ${guideFor(input.context.page)}`);
  if (input.context?.entityType && input.context.entityId) ctxLines.push(`The user is looking at ${input.context.entityType} with id ${input.context.entityId}; use the matching tool (getSale, getCustomerSummary, getSupplierSummary, searchMedicine) to inspect it before answering.`);
  if (input.context?.field) ctxLines.push(`They are asking about the field "${input.context.field}".`);
  if (input.context?.facts) ctxLines.push(`Facts visible on screen: ${JSON.stringify(input.context.facts).slice(0, 1500)}`);
  const lang = language === 'hi' ? 'Reply in simple Hindi (Devanagari).' : language === 'hinglish' ? 'Reply in Hinglish (Hindi words in Latin script) like a shopkeeper would speak.' : language === 'en' ? 'Reply in simple English.' : 'Reply in the same language and script the user used (English, Hindi or Hinglish). If they mix, answer in Hinglish.';
  return [
    'You are the PharmaOS assistant inside an Indian pharmacy management system. You help pharmacy owners and counter staff who may not be technical.',
    `Today is ${today}. Money is in Indian rupees. Quantities: strips/bottles are pack units; tablets/capsules/ml are base (loose) units.`,
    'Rules:',
    '- Use tools for every fact about stock, prices, customers, suppliers, sales, purchases or reports. NEVER invent numbers, batches, expiry dates, prices or balances. If a tool returns nothing, say so.',
    '- If a search returns several similar medicines or people, ask the user to choose; do not guess.',
    '- You can only do what the user can do; if a tool is missing, tell them the feature or permission is not available to them.',
    '- Money and stock never change from your side. For payments, bills, purchases or emails, use the propose/prepare tools; the app shows a confirmation button. Say clearly that they need to confirm.',
    '- Keep answers short: 1-4 sentences or a short list. Avoid technical words. Explain GRN as "goods received note: what actually arrived from the supplier".',
    '- When explaining a screen or field: what it is, why it matters, what to enter, what happens after saving, and the next step. Offer the openPage tool when it helps.',
    `- ${lang}`,
    `- Enabled AI features: ${features.join(', ')}.`,
    ctxLines.length ? `Context:\n${ctxLines.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

/* ---------------------------------------------------------------- files */

async function loadFile(ref: AttachmentRef): Promise<AiInlineFile> {
  const url = attachmentUrl(ref, { expiresInSeconds: 120 });
  if (!url) throw new BusinessRuleError('File storage is not configured on this server, so the document cannot be read.');
  const res = await fetch(url);
  if (!res.ok) throw new BusinessRuleError('The uploaded file could not be retrieved for reading.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 12 * 1024 * 1024) throw new BusinessRuleError('The file is larger than 12 MB; upload a smaller scan.');
  const format = (ref.format || '').toLowerCase();
  const mimeType = format === 'pdf' ? 'application/pdf' : format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
  return { mimeType, data: buf.toString('base64') };
}

/* ---------------------------------------------------------------- chat */

function friendly(err: unknown): string {
  if (err instanceof AiProviderError) return `${err.message} You can continue using the pharmacy system normally.`;
  if (err instanceof BusinessRuleError) return err.message;
  return 'AI is temporarily unavailable. You can continue using the pharmacy system normally.';
}

export async function chat(ctx: RequestContext, input: AiChatInput): Promise<AiChatReply> {
  const { provider, settings } = await resolveAi(ctx.organizationId, 'assistant');
  const features = settings.features ?? [];
  const tools = toolsFor(ctx, features);
  const started = Date.now();
  const usage = { inputTokens: 0, outputTokens: 0 };
  const toolsUsed: string[] = [];
  const actions: AiAction[] = [];

  const history: AiMessage[] = [];
  for (const m of input.messages) history.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] });
  if (input.attachments.length) {
    const last = history[history.length - 1]!;
    for (const ref of input.attachments.slice(0, 3)) last.parts.push({ file: await loadFile(ref) });
  }

  const lastUser = input.messages[input.messages.length - 1]?.content ?? '';
  const simple = /^(what is this|what do i do here|how do i|explain|help|kya hai|kaise|samjhao)/i.test(lastUser) && !input.attachments.length;
  const model = simple ? (settings.liteModel ?? 'gemini-2.5-flash-lite') : (settings.model ?? 'gemini-2.5-flash');
  const system = systemPrompt(ctx, input, settings.language ?? 'auto', features);

  try {
    let reply = '';
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const res = await provider.generate({ model, system, messages: history, tools: tools.map((t) => t.declaration), temperature: settings.temperature ?? 0.2, maxOutputTokens: settings.maxOutputTokens ?? 2048, timeoutMs: settings.timeoutMs ?? 45_000 });
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      if (!res.functionCalls.length || round === MAX_TOOL_ROUNDS) {
        reply = res.text || (res.functionCalls.length ? 'I gathered the information but ran out of steps; please ask again more specifically.' : 'I could not form an answer. Please rephrase.');
        break;
      }
      history.push({ role: 'model', parts: res.functionCalls.map((c) => ({ functionCall: c })) });
      const responses: AiMessage['parts'] = [];
      for (const call of res.functionCalls) {
        const tool = tools.find((t) => t.declaration.name === call.name);
        toolsUsed.push(call.name);
        if (!tool) { responses.push({ functionResponse: { name: call.name, response: { error: 'This tool is not available to the current user.' } } }); continue; }
        try {
          const out = await tool.run(ctx, call.args);
          if (out.actions) actions.push(...out.actions);
          responses.push({ functionResponse: { name: call.name, response: { result: out.data } } });
        } catch (err) {
          responses.push({ functionResponse: { name: call.name, response: { error: (err as Error).message.slice(0, 300) } } });
        }
      }
      history.push({ role: 'user', parts: responses });
    }
    await recordUsage(ctx, { feature: 'assistant', model, ...usage, durationMs: Date.now() - started, ok: true, toolsUsed });
    if (actions.some((a) => a.type !== 'navigate')) await audit(ctx, { action: 'ai.actionProposed', entityType: 'AiAssistant', summary: `Assistant proposed: ${actions.filter((a) => a.type !== 'navigate').map((a) => a.label).join('; ').slice(0, 300)}`, metadata: { toolsUsed } });
    // de-duplicate actions by label, keep order
    const seen = new Set<string>();
    return { reply, actions: actions.filter((a) => (seen.has(a.label) ? false : (seen.add(a.label), true))).slice(0, 6), toolsUsed: [...new Set(toolsUsed)], usage };
  } catch (err) {
    await recordUsage(ctx, { feature: 'assistant', model, ...usage, durationMs: Date.now() - started, ok: false, error: (err as Error).message.slice(0, 200), toolsUsed });
    if (!(err instanceof AiProviderError) && !(err instanceof BusinessRuleError)) logger.error({ err }, 'ai chat failed');
    return { reply: friendly(err), actions: [], toolsUsed, usage };
  }
}

/* ---------------------------------------------------------------- invoice extraction */

const INVOICE_SCHEMA = {
  type: 'object',
  properties: {
    supplierName: { type: 'string', nullable: true },
    supplierGstin: { type: 'string', nullable: true },
    invoiceNumber: { type: 'string', nullable: true },
    invoiceDate: { type: 'string', nullable: true, description: 'YYYY-MM-DD' },
    grandTotal: { type: 'number', nullable: true, description: 'rupees' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          qty: { type: 'number', nullable: true },
          freeQty: { type: 'number', nullable: true },
          batchNumber: { type: 'string', nullable: true },
          expiry: { type: 'string', nullable: true, description: 'YYYY-MM or YYYY-MM-DD as printed' },
          mrp: { type: 'number', nullable: true },
          rate: { type: 'number', nullable: true, description: 'purchase rate per pack in rupees' },
          gstPercent: { type: 'number', nullable: true },
          discountPercent: { type: 'number', nullable: true },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'confidence'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['lines', 'warnings'],
};

const toMinor = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100));
function normaliseExpiry(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (m) { const y = Number(m[1]); const mo = Number(m[2]); const d = m[3] ? Number(m[3]) : new Date(y, mo, 0).getDate(); return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  m = /^(\d{1,2})[\/-](\d{2,4})$/.exec(s);
  if (m) { const mo = Number(m[1]); const yy = m[2] ?? ''; const y = Number(yy.length === 2 ? `20${yy}` : yy); const d = new Date(y, mo, 0).getDate(); return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function extractInvoice(ctx: RequestContext, attachment: AttachmentRef, supplierId?: string): Promise<AiExtractedInvoice> {
  if (!hasPermission(ctx, 'purchases.create')) throw new BusinessRuleError('You cannot create purchases.');
  const { provider, settings } = await resolveAi(ctx.organizationId, 'invoiceReading');
  const started = Date.now();
  const file = await loadFile(attachment);
  const system = 'You read Indian pharmaceutical supplier invoices (GST tax invoices). Extract every product line exactly as printed. Do not guess: if a value is unreadable, return null and add a warning. Batch numbers are alphanumeric codes; expiry is usually MM/YY. Rates are per pack (strip/bottle). Return JSON only.';
  let res;
  try {
    res = await provider.generate({ model: settings.model ?? 'gemini-2.5-flash', system, messages: [{ role: 'user', parts: [{ text: 'Extract this supplier invoice.' }, { file }] }], responseSchema: INVOICE_SCHEMA, temperature: 0, maxOutputTokens: 8192, timeoutMs: Math.max(settings.timeoutMs ?? 45_000, 60_000) });
  } catch (err) {
    await recordUsage(ctx, { feature: 'invoiceReading', model: settings.model ?? '', inputTokens: 0, outputTokens: 0, durationMs: Date.now() - started, ok: false, error: (err as Error).message.slice(0, 200) });
    throw err instanceof AiProviderError ? new BusinessRuleError(friendly(err)) : err;
  }
  await recordUsage(ctx, { feature: 'invoiceReading', model: settings.model ?? '', ...res.usage, durationMs: Date.now() - started, ok: true });
  let parsed: { supplierName?: string | null; supplierGstin?: string | null; invoiceNumber?: string | null; invoiceDate?: string | null; grandTotal?: number | null; lines?: { name: string; qty?: number | null; freeQty?: number | null; batchNumber?: string | null; expiry?: string | null; mrp?: number | null; rate?: number | null; gstPercent?: number | null; discountPercent?: number | null; confidence?: 'high' | 'medium' | 'low' }[]; warnings?: string[] };
  try {
    parsed = JSON.parse(res.text) as typeof parsed;
  } catch {
    throw new BusinessRuleError('The AI reply could not be understood. Try a clearer photo or PDF.');
  }
  const warnings = [...(parsed.warnings ?? [])];
  const lines: AiExtractedInvoice['lines'] = [];
  for (const l of (parsed.lines ?? []).slice(0, 60)) {
    const hits = l.name ? await searchProducts(ctx, l.name.slice(0, 100), 5, false) : [];
    const exact = hits.find((h) => h.name.toLowerCase() === l.name.toLowerCase());
    const chosen = exact ?? (hits.length === 1 ? hits[0] : undefined);
    const expiry = normaliseExpiry(l.expiry);
    if (l.expiry && !expiry) warnings.push(`Could not read the expiry for "${l.name}".`);
    lines.push({ rawName: l.name, productId: chosen?.id ?? null, productName: chosen?.name ?? null, product: chosen ? { name: chosen.name, packLabel: chosen.packLabel, units: chosen.units, pricingUnitId: chosen.pricingUnitId, baseUnitId: chosen.baseUnitId, taxRateBps: chosen.tax.rateBps, cessBps: chosen.tax.cessBps, mrpMinor: chosen.pricing.mrpMinor, sellingPriceMinor: chosen.pricing.sellingPriceMinor } : null, candidates: hits.slice(0, 5).map((h) => ({ id: h.id, name: h.name, packLabel: h.packLabel })), qty: l.qty ?? null, freeQty: l.freeQty ?? null, batchNumber: l.batchNumber ?? null, expiryDate: expiry, mrpMinor: toMinor(l.mrp), purchasePriceMinor: toMinor(l.rate), taxRateBps: l.gstPercent !== null && l.gstPercent !== undefined ? Math.round(l.gstPercent * 100) : null, discountBps: l.discountPercent !== null && l.discountPercent !== undefined ? Math.round(l.discountPercent * 100) : null, confidence: l.confidence ?? 'low', notes: !chosen && hits.length > 1 ? 'Several similar products; pick one.' : !chosen ? 'No matching product in your catalogue.' : '' });
  }
  let supplierMatch: { id: string; name: string } | null = null;
  let supplierCandidates: { id: string; name: string }[] = [];
  if (supplierId) supplierMatch = { id: supplierId, name: '' };
  else if (parsed.supplierName || parsed.supplierGstin) {
    const { items } = await listSuppliers(ctx, { page: 1, pageSize: 5, q: (parsed.supplierGstin || parsed.supplierName || '').slice(0, 100) });
    supplierCandidates = items.map((s) => ({ id: s.id, name: s.name }));
    const gst = items.find((s) => parsed.supplierGstin && s.gstin === parsed.supplierGstin.toUpperCase());
    if (gst) supplierMatch = { id: gst.id, name: gst.name };
    else if (items.length === 1) supplierMatch = { id: items[0]!.id, name: items[0]!.name };
    if (!supplierMatch && !items.length) warnings.push('Supplier not found in your list; add them first or pick one manually.');
  }
  await audit(ctx, { action: 'ai.invoiceExtracted', entityType: 'AiAssistant', summary: `Read supplier invoice ${parsed.invoiceNumber ?? ''} (${lines.length} lines, ${lines.filter((l) => l.productId).length} matched)` });
  return { supplierName: parsed.supplierName ?? null, supplierGstin: parsed.supplierGstin ?? null, supplierId: supplierMatch?.id ?? null, supplierCandidates, invoiceNumber: parsed.invoiceNumber ?? null, invoiceDate: normaliseExpiry(parsed.invoiceDate), lines, grandTotalMinor: toMinor(parsed.grandTotal), warnings, usage: res.usage };
}

/* ---------------------------------------------------------------- prescription extraction */

const PRESCRIPTION_SCHEMA = {
  type: 'object',
  properties: {
    doctorName: { type: 'string', nullable: true },
    doctorRegNo: { type: 'string', nullable: true },
    hospital: { type: 'string', nullable: true },
    date: { type: 'string', nullable: true },
    diagnosis: { type: 'string', nullable: true },
    items: { type: 'array', items: { type: 'object', properties: { medicine: { type: 'string' }, dosage: { type: 'string', nullable: true }, duration: { type: 'string', nullable: true }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['medicine', 'confidence'] } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['items', 'warnings'],
};

export async function extractPrescription(ctx: RequestContext, attachment: AttachmentRef): Promise<AiExtractedPrescription> {
  if (!hasPermission(ctx, 'prescriptions.manage')) throw new BusinessRuleError('You cannot manage prescriptions.');
  const { provider, settings } = await resolveAi(ctx.organizationId, 'invoiceReading');
  const started = Date.now();
  const file = await loadFile(attachment);
  const system = 'You read handwritten and printed doctor prescriptions from India. List each medicine with dosage (e.g. 1-0-1) and duration as written. Handwriting is often unclear: mark uncertain names as low confidence and add a warning instead of guessing. Return JSON only.';
  let res;
  try {
    res = await provider.generate({ model: settings.model ?? 'gemini-2.5-flash', system, messages: [{ role: 'user', parts: [{ text: 'Extract this prescription.' }, { file }] }], responseSchema: PRESCRIPTION_SCHEMA, temperature: 0, maxOutputTokens: 4096, timeoutMs: Math.max(settings.timeoutMs ?? 45_000, 60_000) });
  } catch (err) {
    await recordUsage(ctx, { feature: 'invoiceReading', model: settings.model ?? '', inputTokens: 0, outputTokens: 0, durationMs: Date.now() - started, ok: false, error: (err as Error).message.slice(0, 200) });
    throw err instanceof AiProviderError ? new BusinessRuleError(friendly(err)) : err;
  }
  await recordUsage(ctx, { feature: 'invoiceReading', model: settings.model ?? '', ...res.usage, durationMs: Date.now() - started, ok: true });
  let parsed: { doctorName?: string | null; doctorRegNo?: string | null; hospital?: string | null; date?: string | null; diagnosis?: string | null; items?: { medicine: string; dosage?: string | null; duration?: string | null; confidence?: 'high' | 'medium' | 'low' }[]; warnings?: string[] };
  try {
    parsed = JSON.parse(res.text) as typeof parsed;
  } catch {
    throw new BusinessRuleError('The AI reply could not be understood. Try a clearer photo.');
  }
  const items: AiExtractedPrescription['items'] = [];
  for (const it of (parsed.items ?? []).slice(0, 30)) {
    const hits = await searchProducts(ctx, it.medicine.slice(0, 100), 4, false);
    const exact = hits.find((h) => h.name.toLowerCase().startsWith(it.medicine.toLowerCase()));
    items.push({ medicine: it.medicine, dosage: it.dosage ?? '', duration: it.duration ?? '', productId: exact?.id ?? (hits.length === 1 ? hits[0]!.id : null), candidates: hits.map((h) => ({ id: h.id, name: h.name })), confidence: it.confidence ?? 'low' });
  }
  await audit(ctx, { action: 'ai.prescriptionExtracted', entityType: 'AiAssistant', summary: `Read a prescription (${items.length} medicines)` });
  return { doctorName: parsed.doctorName ?? null, doctorRegNo: parsed.doctorRegNo ?? null, hospital: parsed.hospital ?? null, prescriptionDate: normaliseExpiry(parsed.date), diagnosis: parsed.diagnosis ?? null, items, warnings: parsed.warnings ?? [], usage: res.usage };
}
