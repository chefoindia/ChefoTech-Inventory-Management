'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, PackageCheck, Sparkles } from 'lucide-react';
import { createPurchaseSchema, computeDocumentTotals, isInterState, type CreatePurchaseInput, type PurchaseDto, type ProductSearchHit, type SupplierDto, type AttachmentRef, type DocumentTotals } from '@pharmaos/shared';
import { useCreatePurchase, useUpdatePurchase } from './api';
import { AiInvoiceReview, type ReviewedLine } from './ai-invoice-review';
import { useAiAvailable, useExtractInvoice } from '@/features/ai/api';
import { useSupplier } from '@/features/parties/api';
import type { AiExtractedInvoice } from '@pharmaos/shared';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { money, dateInput } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ColumnHint } from '@/components/ui/info-hint';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { MoneyInput, PercentInput } from '@/components/ui/money-input';
import { ProductPicker, SupplierPicker } from '@/components/ui/pickers';
import { PaymentLines, toPaymentLines, type PaymentDraft } from '@/components/ui/payment-lines';
import { TotalsPanel } from '@/components/ui/totals-panel';
import { FileUpload, AttachmentList } from '@/components/ui/file-upload';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';

interface LineDraft {
  key: string;
  productId: string;
  product?: { name: string; units: ProductSearchHit['units']; pricingUnitId: string; baseUnitId: string; taxRateBps: number; cessBps: number; mrpMinor: number; sellingPriceMinor: number; purchasePriceMinor?: number; packLabel: string };
  unitId: string;
  qty: number | null;
  freeQty: number | null;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  purchasePriceMinor: number | null;
  mrpMinor: number | null;
  sellingPriceMinor: number | null;
  discountBps: number;
  discountMinor: number;
  schemeNote: string;
  taxRateBps: number | null;
  /** Optional pack barcodes, only collected when the stock is received with the purchase. */
  barcodes: string[];
}

const key = () => Math.random().toString(36).slice(2, 10);
const emptyLine = (): LineDraft => ({ key: key(), productId: '', unitId: '', qty: null, freeQty: 0, batchNumber: '', mfgDate: '', expiryDate: '', purchasePriceMinor: null, mrpMinor: null, sellingPriceMinor: null, discountBps: 0, discountMinor: 0, schemeNote: '', taxRateBps: null, barcodes: [] });

function fromDto(p: PurchaseDto): LineDraft[] {
  return p.lines.map((l) => ({ key: l.lineId, productId: l.productId, product: { name: l.productName, units: [{ unitId: l.unitId, unitName: l.unitName, abbreviation: l.unitName, factorToBase: l.factorToBase, isDefaultPurchase: true, isDefaultSale: false, allowLooseSale: true }], pricingUnitId: l.unitId, baseUnitId: l.unitId, taxRateBps: l.taxRateBps, cessBps: l.cessBps, mrpMinor: l.mrpMinor, sellingPriceMinor: l.sellingPriceMinor, purchasePriceMinor: l.purchasePriceMinor, packLabel: l.packLabel }, unitId: l.unitId, qty: l.qty, freeQty: l.freeQty, batchNumber: l.batchNumber, mfgDate: l.mfgDate ? dateInput(l.mfgDate) : '', expiryDate: dateInput(l.expiryDate), purchasePriceMinor: l.purchasePriceMinor, mrpMinor: l.mrpMinor, sellingPriceMinor: l.sellingPriceMinor, discountBps: l.discountBps, discountMinor: l.discountMinor, schemeNote: l.schemeNote, taxRateBps: l.taxRateBps, barcodes: [] }));
}

const GST_RATES = [0, 500, 1200, 1800, 2800];

/** Purchase invoice entry. Totals are computed client-side with the shared tax engine and verified server-side. */
/**
 * Optional pack barcodes for one purchase line, shown only when the stock is being received
 * with the purchase (otherwise they are captured on the goods receipt instead). Scanners send
 * the code followed by Enter, so a strip is one scan.
 */
function LineBarcodes({ productName, expected, codes, onChange }: { productName: string; expected: number; codes: string[]; onChange: (codes: string[]) => void }) {
  const [draft, setDraft] = React.useState('');
  const add = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    if (codes.includes(code)) { toast.error(`${code} is already scanned for ${productName}`); setDraft(''); return; }
    onChange([...codes, code]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-fg-subtle">Pack barcodes <span className="lowercase">(optional)</span></span>
      <Input
        className="h-8 w-52 font-mono"
        placeholder={`Scan a label for ${productName}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
        aria-label={`Barcode label for ${productName}`}
      />
      <Button variant="secondary" size="sm" onClick={() => add(draft)} disabled={!draft.trim()}>Add</Button>
      {expected > 0 ? <span className={`text-[12px] ${codes.length >= expected ? 'text-success-700' : 'text-fg-subtle'}`}>{codes.length} of {expected} labelled</span> : null}
      {codes.map((c) => (
        <button key={c} type="button" onClick={() => onChange(codes.filter((x) => x !== c))} className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 font-mono text-[11px] hover:border-danger-400 hover:text-danger-600" title="Remove this label">
          {c} <span aria-hidden>×</span>
        </button>
      ))}
    </div>
  );
}

export function PurchaseForm({ purchase, onSaved, onCancel }: { purchase: PurchaseDto | null; onSaved: (p: PurchaseDto, receiveNext?: boolean) => void; onCancel: () => void }) {
  const me = useSession((s) => s.me)!;
  const outletId = useSession((s) => s.activeOutletId);
  const outlet = me.outlets.find((o) => o.id === outletId);
  const create = useCreatePurchase();
  const update = useUpdatePurchase();
  const canReceive = usePermission('purchases.receive');
  const canPay = usePermission('purchases.pay');
  const [supplierId, setSupplierId] = React.useState<string | null>(purchase?.supplierId ?? null);
  const [supplier, setSupplier] = React.useState<SupplierDto | null>(null);
  const [invoiceNumber, setInvoiceNumber] = React.useState(purchase?.supplierInvoiceNumber ?? '');
  const [invoiceDate, setInvoiceDate] = React.useState(purchase ? dateInput(purchase.invoiceDate) : dateInput(new Date()));
  const [dueDate, setDueDate] = React.useState(purchase?.dueDate ? dateInput(purchase.dueDate) : '');
  const [lines, setLines] = React.useState<LineDraft[]>(purchase ? fromDto(purchase) : [emptyLine()]);
  const [billDiscountBps, setBillDiscountBps] = React.useState(0);
  const [billDiscountMinor, setBillDiscountMinor] = React.useState(purchase?.totals.billDiscountMinor ?? 0);
  const [otherChargesMinor, setOtherChargesMinor] = React.useState(purchase?.totals.otherChargesMinor ?? 0);
  const [otherChargesNote, setOtherChargesNote] = React.useState(purchase?.otherChargesNote ?? '');
  const [roundOff, setRoundOff] = React.useState(true);
  const [payments, setPayments] = React.useState<PaymentDraft[]>([]);
  const [receiveNow, setReceiveNow] = React.useState(false);
  const [attachments, setAttachments] = React.useState<AttachmentRef[]>(purchase?.attachments ?? []);
  const [notes, setNotes] = React.useState(purchase?.notes ?? '');
  const [customFields, setCustomFields] = React.useState<Record<string, unknown>>(purchase?.customFields ?? {});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [idem, setIdem] = React.useState(newIdempotencyKey);
  const pending = create.isPending || update.isPending;
  const ai = useAiAvailable('invoiceReading');
  const extract = useExtractInvoice();
  const [aiResult, setAiResult] = React.useState<AiExtractedInvoice | null>(null);
  const [aiOpen, setAiOpen] = React.useState(false);

  // Supplier chosen by id only (AI draft / restored draft): load it so terms and GST state apply.
  const supplierById = useSupplier(supplierId && !supplier ? supplierId : null);
  React.useEffect(() => {
    if (supplierById.data && !supplier) setSupplier(supplierById.data);
  }, [supplierById.data, supplier]);

  // A draft prepared by the AI assistant ("prepare a purchase for ...") lands here for review; nothing was saved.
  const draftKey = `pharmaos.purchaseDraft.${me.user.id}`;
  const draftConsumed = React.useRef(false);
  React.useEffect(() => {
    if (purchase || draftConsumed.current) return;
    draftConsumed.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      localStorage.removeItem(draftKey);
      const d = JSON.parse(raw) as { supplierId?: string | null; supplierInvoiceNumber?: string; invoiceDate?: string; lines?: { productId: string; productName: string; packLabel: string; units: ProductSearchHit['units']; pricingUnitId: string; baseUnitId: string; taxRateBps: number; cessBps: number; unitId: string; qty: number; freeQty: number; batchNumber: string; expiryDate: string; purchasePriceMinor: number | null; mrpMinor: number; sellingPriceMinor: number }[] };
      if (!d.lines?.length) return;
      if (d.supplierId) setSupplierId(d.supplierId);
      if (d.supplierInvoiceNumber) setInvoiceNumber(d.supplierInvoiceNumber);
      if (d.invoiceDate) setInvoiceDate(d.invoiceDate.slice(0, 10));
      setLines(d.lines.map((l) => ({ ...emptyLine(), productId: l.productId, product: { name: l.productName, units: l.units, pricingUnitId: l.pricingUnitId, baseUnitId: l.baseUnitId, taxRateBps: l.taxRateBps, cessBps: l.cessBps, mrpMinor: l.mrpMinor, sellingPriceMinor: l.sellingPriceMinor, packLabel: l.packLabel }, unitId: l.unitId, qty: l.qty, freeQty: l.freeQty, batchNumber: l.batchNumber, expiryDate: l.expiryDate, purchasePriceMinor: l.purchasePriceMinor, mrpMinor: l.mrpMinor || null, sellingPriceMinor: l.sellingPriceMinor || null })));
      toast.info('Draft from the AI assistant loaded. Check every line before saving.');
    } catch {
      /* corrupt draft: ignore */
    }
  }, [draftKey, purchase]);

  const readWithAi = (att: AttachmentRef) => {
    extract.mutate({ attachment: att, supplierId: supplierId ?? undefined }, {
      onSuccess: (r) => { setAiResult(r); setAiOpen(true); },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };
  const applyAi = (reviewed: ReviewedLine[], header: { supplierId: string | null; invoiceNumber: string | null; invoiceDate: string | null }) => {
    if (!supplierId && header.supplierId) setSupplierId(header.supplierId);
    if (!invoiceNumber && header.invoiceNumber) setInvoiceNumber(header.invoiceNumber);
    if (header.invoiceDate) setInvoiceDate(header.invoiceDate.slice(0, 10));
    const mapped: LineDraft[] = reviewed.map((r) => {
      const unitId = r.product.units.find((u) => u.isDefaultPurchase)?.unitId ?? r.product.pricingUnitId;
      return { ...emptyLine(), productId: r.productId, product: r.product, unitId, qty: r.qty, freeQty: r.freeQty, batchNumber: r.batchNumber, expiryDate: r.expiryDate, purchasePriceMinor: r.purchasePriceMinor, mrpMinor: r.mrpMinor, sellingPriceMinor: r.product.sellingPriceMinor || null, discountBps: r.discountBps, taxRateBps: r.taxRateBps };
    });
    setLines((ls) => [...ls.filter((l) => l.productId), ...mapped]);
    toast.success(`${mapped.length} line${mapped.length === 1 ? '' : 's'} filled from the invoice. Review and save.`);
  };

  React.useEffect(() => {
    if (supplier && !purchase && !dueDate && supplier.paymentTermsDays) {
      const d = new Date(invoiceDate); d.setDate(d.getDate() + supplier.paymentTermsDays); setDueDate(dateInput(d));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier]);

  const updateLine = (k: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const setProduct = (k: string, id: string | null, hit?: ProductSearchHit) => {
    if (!id || !hit) return updateLine(k, { productId: '', product: undefined });
    const unitId = hit.units.find((u) => u.isDefaultPurchase)?.unitId ?? hit.pricingUnitId;
    updateLine(k, { productId: id, product: { name: hit.name, units: hit.units, pricingUnitId: hit.pricingUnitId, baseUnitId: hit.baseUnitId, taxRateBps: hit.tax.rateBps, cessBps: hit.tax.cessBps, mrpMinor: hit.pricing.mrpMinor, sellingPriceMinor: hit.pricing.sellingPriceMinor, packLabel: hit.packLabel }, unitId, mrpMinor: hit.pricing.mrpMinor || null, sellingPriceMinor: hit.pricing.sellingPriceMinor || null, taxRateBps: null });
  };

  // live totals
  const placeOfSupply = outlet?.stateCode || me.organization.tax.stateCode;
  const taxCtx = { engine: 'in-gst' as const, pricesIncludeTax: false, supplierStateCode: supplier?.stateCode || purchase?.supplierGstin?.slice(0, 2) || placeOfSupply, placeOfSupplyStateCode: placeOfSupply };
  const computed = React.useMemo(() => {
    const valid = lines.filter((l) => l.product && l.qty && l.purchasePriceMinor !== null);
    const taxLines = valid.map((l) => {
      const unit = l.product!.units.find((u) => u.unitId === l.unitId);
      const pricingFactor = l.product!.units.find((u) => u.unitId === l.product!.pricingUnitId)?.factorToBase ?? 1;
      const qtyBase = (l.qty ?? 0) * (unit?.factorToBase ?? 1);
      const grossMinor = Math.round((qtyBase * (l.purchasePriceMinor ?? 0)) / pricingFactor);
      return { grossMinor, discountBps: l.discountBps, discountMinor: l.discountMinor, taxRateBps: l.taxRateBps ?? l.product!.taxRateBps, cessBps: l.product!.cessBps };
    });
    if (!taxLines.length) return null;
    return computeDocumentTotals(taxLines, taxCtx, { billDiscountBps, billDiscountMinor, otherChargesMinor, roundOff: roundOff ? 'nearest' : 'none' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, billDiscountBps, billDiscountMinor, otherChargesMinor, roundOff, taxCtx.supplierStateCode, taxCtx.placeOfSupplyStateCode]);
  const totals: DocumentTotals | null = computed?.totals ?? null;
  const paid = payments.reduce((s, p) => s + (p.amountMinor ?? 0), 0);

  const submit = (receiveNowOverride?: boolean, thenReceive = false) => {
    const receiving = receiveNowOverride ?? receiveNow;
    const input = {
      supplierId: supplierId ?? '',
      supplierInvoiceNumber: invoiceNumber,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, unitId: l.unitId, qty: l.qty ?? 0, freeQty: l.freeQty ?? 0, batchNumber: l.batchNumber, mfgDate: l.mfgDate ? new Date(l.mfgDate) : undefined, expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined, purchasePriceMinor: l.purchasePriceMinor ?? 0, mrpMinor: l.mrpMinor ?? 0, sellingPriceMinor: l.sellingPriceMinor ?? undefined, discountBps: l.discountBps, discountMinor: l.discountMinor, schemeNote: l.schemeNote, taxRateBps: l.taxRateBps ?? undefined, barcodes: receiving ? l.barcodes : [] })),
      billDiscountBps,
      billDiscountMinor,
      otherChargesMinor,
      otherChargesNote,
      roundOff,
      payments: toPaymentLines(payments),
      receiveNow: receiving,
      attachments,
      notes,
      customFields,
      expectedGrandTotalMinor: totals?.grandTotalMinor,
    };
    const parsed = createPurchaseSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[issue.path.join('.')] = issue.message;
      setErrors(errs);
      const first = parsed.error.issues[0];
      toast.error(first?.path[0] === 'lines' ? `Line ${Number(first.path[1]) + 1}: ${first.message} (${String(first.path[2] ?? '')})` : `${first?.path.join('.')}: ${first?.message}`);
      return;
    }
    setErrors({});
    const fail = (err: unknown) => { toast.error(errorMessage(err)); setIdem(newIdempotencyKey()); };
    if (purchase) {
      const { receiveNow: _receiveNow, payments: _payments, ...rest } = parsed.data;
      void _receiveNow; void _payments;
      update.mutate({ id: purchase.id, input: rest }, { onSuccess: (p) => { toast.success('Purchase updated'); onSaved(p, false); }, onError: fail });
    } else {
      create.mutate({ input: parsed.data as CreatePurchaseInput, idempotencyKey: idem }, { onSuccess: (p) => { toast.success(`Purchase ${p.number} saved${p.status === 'received' ? ' and stock received' : ''}`); onSaved(p, thenReceive); }, onError: fail });
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Supplier invoice</CardTitle><CardDescription>Enter the supplier&apos;s bill as printed. GST is computed per line from the taxable value.</CardDescription></CardHeader>
        <CardContent>
          <FormGrid className="sm:grid-cols-4">
            <FormField info="Who sent this invoice. Their payment terms fill the due date, and the bill posts to their account so you always know what you owe them." label="Supplier" htmlFor="supplier" required error={errors.supplierId} className="sm:col-span-2"><SupplierPicker value={supplierId} onChange={(id, s) => { setSupplierId(id); setSupplier(s ?? null); }} disabled={!!purchase} /></FormField>
            <FormField info="The bill number exactly as printed on the supplier invoice. Enter it as it appears, so your books match theirs when you reconcile." label="Invoice no." htmlFor="inv" required error={errors.supplierInvoiceNumber}><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></FormField>
            <FormField info="The date on the supplier invoice, not today. Due dates and purchase reports are worked out from this." label="Invoice date" htmlFor="inv-date" required error={errors.invoiceDate}><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></FormField>
            <FormField info="When you have to pay. Filled in from the supplier payment terms, and you can change it. It drives the overdue payables list." label="Due date" htmlFor="due" hint={supplier?.paymentTermsDays ? `${supplier.paymentTermsDays}-day terms` : undefined}><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></FormField>
            {supplier ? <div className="sm:col-span-3 flex items-end pb-2 text-[12px] text-fg-subtle">{supplier.gstin ? `GSTIN ${supplier.gstin} · ` : ''}{isInterState(taxCtx) ? 'Inter-state purchase (IGST)' : 'Intra-state purchase (CGST + SGST)'}{supplier.balanceMinor ? ` · payable ${money(supplier.balanceMinor)}` : ''}</div> : null}
          </FormGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle><CardDescription>Prices are per the product&apos;s pricing unit (usually a strip or bottle). Free quantity adds stock without cost.</CardDescription></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead className="bg-surface-muted text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
              <tr><th className="px-3 py-2 w-[260px]"><ColumnHint title="Product">The product from your catalogue. If it is not there yet, add it first; the purchase then fills its stock.</ColumnHint></th><th className="px-2 py-2"><ColumnHint title="Unit">The unit the supplier billed you in, usually strips or boxes rather than single tablets. Stock is converted to base units for you.</ColumnHint></th><th className="px-2 py-2 text-right"><ColumnHint title="Qty">How many of that unit you were charged for. Free goods go in the next column, not here.</ColumnHint></th><th className="px-2 py-2 text-right"><ColumnHint title="Free">Extra units the distributor gave free as a scheme. They add to stock without adding to cost, which lowers your real purchase rate.</ColumnHint></th><th className="px-2 py-2"><ColumnHint title="Batch">The batch number on the pack. Stock, expiry and MRP are tracked per batch, so this must match the pack in your hand.</ColumnHint></th><th className="px-2 py-2"><ColumnHint title="Expiry">The expiry printed on this batch. It drives your near-expiry alerts and blocks the sale once it passes.</ColumnHint></th><th className="px-2 py-2 text-right"><ColumnHint title="Rate">What you pay for one unit before GST, as printed on the supplier invoice. This is your cost, not the customer price.</ColumnHint></th><th className="px-2 py-2 text-right"><ColumnHint title="MRP">The maximum retail price printed on this batch. The counter uses it as the ceiling when billing this stock.</ColumnHint></th><th className="px-2 py-2 text-right"><ColumnHint title="Selling">What you will charge for this batch, if it is not the MRP. Leave it as the MRP if you sell at printed price.</ColumnHint></th><th className="px-2 py-2 text-right"><ColumnHint title="Disc %">The trade discount the supplier gave on this line, as shown on their invoice. It reduces your cost, not the customer price.</ColumnHint></th><th className="px-2 py-2"><ColumnHint title="GST">The GST rate on this line. It comes from the product and can be changed if the supplier invoice shows a different rate.</ColumnHint></th><th className="px-2 py-2 text-right"><ColumnHint title="Amount">Line total after discount and GST. Compare it with the supplier invoice before you save.</ColumnHint></th><th className="w-8" /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => {
                const lineTotal = computed?.lines[lines.filter((x) => x.product && x.qty && x.purchasePriceMinor !== null).indexOf(l)]?.totalMinor;
                const err = (f: string) => errors[`lines.${i}.${f}`];
                return (
                  <React.Fragment key={l.key}>
                  <tr className="align-top">
                    <td className="px-3 py-1.5">
                      <ProductPicker value={l.productId || null} onChange={(id, hit) => setProduct(l.key, id, hit)} disabled={!!purchase && purchase.status !== 'draft'} />
                      {l.product?.packLabel ? <div className="mt-0.5 text-[11px] text-fg-subtle">{l.product.packLabel}</div> : null}
                      {err('productId') ? <div className="text-[11px] text-danger-600">{err('productId')}</div> : null}
                    </td>
                    <td className="px-2 py-1.5"><Select className="h-8 w-24" value={l.unitId} onChange={(e) => updateLine(l.key, { unitId: e.target.value })} disabled={!l.product} aria-label="Unit">{(l.product?.units ?? []).map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}</Select></td>
                    <td className="px-2 py-1.5"><Input type="number" min={0} className="h-8 w-20 text-right" value={l.qty ?? ''} onChange={(e) => updateLine(l.key, { qty: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Quantity" />{err('qty') ? <div className="text-[11px] text-danger-600">{err('qty')}</div> : null}</td>
                    <td className="px-2 py-1.5"><Input type="number" min={0} className="h-8 w-16 text-right" value={l.freeQty ?? ''} onChange={(e) => updateLine(l.key, { freeQty: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Free quantity" /></td>
                    <td className="px-2 py-1.5"><Input className="h-8 w-28 font-mono" value={l.batchNumber} onChange={(e) => updateLine(l.key, { batchNumber: e.target.value })} aria-label="Batch number" />{err('batchNumber') ? <div className="text-[11px] text-danger-600">{err('batchNumber')}</div> : null}</td>
                    <td className="px-2 py-1.5"><Input type="date" className="h-8 w-36" value={l.expiryDate} onChange={(e) => updateLine(l.key, { expiryDate: e.target.value })} aria-label="Expiry date" />{err('expiryDate') ? <div className="text-[11px] text-danger-600">Required</div> : null}</td>
                    <td className="px-2 py-1.5"><MoneyInput className="h-8 w-28" value={l.purchasePriceMinor} onChange={(v) => updateLine(l.key, { purchasePriceMinor: v })} aria-label="Purchase rate" /></td>
                    <td className="px-2 py-1.5"><MoneyInput className="h-8 w-28" value={l.mrpMinor} onChange={(v) => updateLine(l.key, { mrpMinor: v })} aria-label="MRP" /></td>
                    <td className="px-2 py-1.5"><MoneyInput className="h-8 w-28" value={l.sellingPriceMinor} onChange={(v) => updateLine(l.key, { sellingPriceMinor: v })} aria-label="Selling price" /></td>
                    <td className="px-2 py-1.5"><PercentInput className="h-8 w-20" value={l.discountBps} onChange={(v) => updateLine(l.key, { discountBps: v ?? 0 })} aria-label="Discount percent" /></td>
                    <td className="px-2 py-1.5"><Select className="h-8 w-20" value={l.taxRateBps ?? l.product?.taxRateBps ?? 1200} onChange={(e) => updateLine(l.key, { taxRateBps: Number(e.target.value) })} aria-label="GST rate">{GST_RATES.map((r) => <option key={r} value={r}>{r / 100}%</option>)}</Select></td>
                    <td className="px-2 py-1.5 text-right tabular font-medium leading-8">{lineTotal !== undefined ? money(lineTotal) : '—'}</td>
                    <td className="px-1 py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                  {receiveNow && !purchase && l.product ? (
                    <tr className="bg-bg-subtle/50">
                      <td colSpan={13} className="px-3 pb-2">
                        <LineBarcodes productName={l.product.name} expected={(l.qty ?? 0) + (l.freeQty ?? 0)} codes={l.barcodes} onChange={(codes) => updateLine(l.key, { barcodes: codes })} />
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <CardContent className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus className="h-3.5 w-3.5" /> Add line</Button>
          <Input className="h-8 w-72" placeholder="Scheme / free-goods note" value={lines[lines.length - 1]?.schemeNote ?? ''} onChange={(e) => updateLine(lines[lines.length - 1]!.key, { schemeNote: e.target.value })} aria-label="Scheme note for last line" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Charges, payment & files</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FormGrid className="sm:grid-cols-4">
              <FormField info="A discount the supplier gave on the whole bill, as a percentage. Use this only for a discount that is not already on the lines." label="Bill discount %" htmlFor="bd-pct"><PercentInput value={billDiscountBps} onChange={(v) => setBillDiscountBps(v ?? 0)} /></FormField>
              <FormField info="A flat discount on the whole bill in rupees, when the supplier shows a lump sum rather than a percentage." label="Bill discount ₹" htmlFor="bd-amt"><MoneyInput value={billDiscountMinor} onChange={(v) => setBillDiscountMinor(v ?? 0)} /></FormField>
              <FormField info="Freight, packing or delivery charges added at the bottom of the supplier invoice." label="Other charges" htmlFor="oc"><MoneyInput value={otherChargesMinor} onChange={(v) => setOtherChargesMinor(v ?? 0)} /></FormField>
              <FormField info="What the other charges were for, for example freight. It is kept with the purchase for your records." label="Charges note" htmlFor="oc-note"><Input value={otherChargesNote} onChange={(e) => setOtherChargesNote(e.target.value)} placeholder="Freight" /></FormField>
            </FormGrid>
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <label className="flex items-center gap-2"><Checkbox checked={roundOff} onChange={(e) => setRoundOff(e.target.checked)} /> Round off to the rupee</label>
              {!purchase && canReceive ? <label className="flex items-center gap-2"><Checkbox checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} /> Receive all stock now (skip separate GRN)</label> : null}
            </div>
            {!purchase && canPay ? (
              <div>
                <div className="mb-1 text-[13px] font-medium">Payment made now <span className="font-normal text-fg-subtle">(optional; leave empty to pay later)</span></div>
                {payments.length ? <PaymentLines value={payments} onChange={setPayments} total={totals?.grandTotalMinor ?? 0} /> : <Button variant="secondary" size="sm" onClick={() => setPayments([{ method: 'bank_transfer', amountMinor: totals?.grandTotalMinor ?? null, reference: '' }])}><Plus className="h-3.5 w-3.5" /> Add payment</Button>}
              </div>
            ) : null}
            <div>
              <div className="mb-1 flex items-center justify-between gap-2"><span className="text-[13px] font-medium">Invoice scan / attachments</span><div className="flex items-center gap-2">{ai.available && attachments.length && !purchase ? <Button variant="secondary" size="sm" loading={extract.isPending} onClick={() => readWithAi(attachments[attachments.length - 1]!)} title="Reads the last uploaded file and prepares lines for your review"><Sparkles className="h-3.5 w-3.5" /> Read invoice with AI</Button> : null}<FileUpload purpose="purchaseInvoice" multiple accept="image/*,.pdf" onUploaded={(refs) => setAttachments((a) => [...a, ...refs].slice(0, 5))} label="Upload" /></div></div>
              <AttachmentList items={attachments} onRemove={(pid) => setAttachments((a) => a.filter((x) => x.publicId !== pid))} />
              {ai.available && !attachments.length && !purchase ? <p className="mt-1 text-[12px] text-fg-subtle">Upload a photo or PDF of the supplier bill and the AI can fill the lines for you to check.</p> : null}
              <AiInvoiceReview result={aiResult} open={aiOpen} onOpenChange={setAiOpen} onApply={applyAi} />
            </div>
            <FormField info="Anything about this purchase your team should remember, such as a short supply or a replacement promised by the distributor." label="Notes" htmlFor="notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
            <CustomFieldsForm entity="purchase" values={customFields} onChange={setCustomFields} />
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
          <CardContent>
            <TotalsPanel totals={totals} isInterState={isInterState(taxCtx)} extra={paid ? <div className="mt-2 flex justify-between text-[13px] text-fg-muted"><span>Paid now</span><span className="tabular">{money(paid)}</span></div> : undefined} />
            {!totals ? <p className="text-[13px] text-fg-subtle">Add items to see totals.</p> : null}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <Button loading={pending} disabled={!totals || !supplierId} onClick={() => submit()}>{receiveNow && !purchase ? <PackageCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />} {purchase ? 'Save changes' : receiveNow ? 'Save & receive stock' : 'Save purchase'}</Button>
            {!purchase ? <p className="text-[12px] text-fg-subtle">{receiveNow ? 'Stock is added now. The pack barcodes on each line are optional.' : 'Only the supplier bill is recorded — receive the stock later from the purchase, where you can scan the pack barcodes.'}</p> : null}
            <Button variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
