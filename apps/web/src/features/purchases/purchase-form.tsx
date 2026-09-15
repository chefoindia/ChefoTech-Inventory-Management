'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, PackageCheck } from 'lucide-react';
import { createPurchaseSchema, computeDocumentTotals, isInterState, type CreatePurchaseInput, type PurchaseDto, type ProductSearchHit, type SupplierDto, type AttachmentRef, type DocumentTotals } from '@pharmaos/shared';
import { useCreatePurchase, useUpdatePurchase } from './api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { money, dateInput } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
}

const key = () => Math.random().toString(36).slice(2, 10);
const emptyLine = (): LineDraft => ({ key: key(), productId: '', unitId: '', qty: null, freeQty: 0, batchNumber: '', mfgDate: '', expiryDate: '', purchasePriceMinor: null, mrpMinor: null, sellingPriceMinor: null, discountBps: 0, discountMinor: 0, schemeNote: '', taxRateBps: null });

function fromDto(p: PurchaseDto): LineDraft[] {
  return p.lines.map((l) => ({ key: l.lineId, productId: l.productId, product: { name: l.productName, units: [{ unitId: l.unitId, unitName: l.unitName, abbreviation: l.unitName, factorToBase: l.factorToBase, isDefaultPurchase: true, isDefaultSale: false, allowLooseSale: true }], pricingUnitId: l.unitId, baseUnitId: l.unitId, taxRateBps: l.taxRateBps, cessBps: l.cessBps, mrpMinor: l.mrpMinor, sellingPriceMinor: l.sellingPriceMinor, purchasePriceMinor: l.purchasePriceMinor, packLabel: l.packLabel }, unitId: l.unitId, qty: l.qty, freeQty: l.freeQty, batchNumber: l.batchNumber, mfgDate: l.mfgDate ? dateInput(l.mfgDate) : '', expiryDate: dateInput(l.expiryDate), purchasePriceMinor: l.purchasePriceMinor, mrpMinor: l.mrpMinor, sellingPriceMinor: l.sellingPriceMinor, discountBps: l.discountBps, discountMinor: l.discountMinor, schemeNote: l.schemeNote, taxRateBps: l.taxRateBps }));
}

const GST_RATES = [0, 500, 1200, 1800, 2800];

/** Purchase invoice entry. Totals are computed client-side with the shared tax engine and verified server-side. */
export function PurchaseForm({ purchase, onSaved, onCancel }: { purchase: PurchaseDto | null; onSaved: (p: PurchaseDto) => void; onCancel: () => void }) {
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
  const [receiveNow, setReceiveNow] = React.useState(!purchase);
  const [attachments, setAttachments] = React.useState<AttachmentRef[]>(purchase?.attachments ?? []);
  const [notes, setNotes] = React.useState(purchase?.notes ?? '');
  const [customFields, setCustomFields] = React.useState<Record<string, unknown>>(purchase?.customFields ?? {});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [idem] = React.useState(newIdempotencyKey);
  const pending = create.isPending || update.isPending;

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

  const submit = () => {
    const input = {
      supplierId: supplierId ?? '',
      supplierInvoiceNumber: invoiceNumber,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, unitId: l.unitId, qty: l.qty ?? 0, freeQty: l.freeQty ?? 0, batchNumber: l.batchNumber, mfgDate: l.mfgDate ? new Date(l.mfgDate) : undefined, expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined, purchasePriceMinor: l.purchasePriceMinor ?? 0, mrpMinor: l.mrpMinor ?? 0, sellingPriceMinor: l.sellingPriceMinor ?? undefined, discountBps: l.discountBps, discountMinor: l.discountMinor, schemeNote: l.schemeNote, taxRateBps: l.taxRateBps ?? undefined })),
      billDiscountBps,
      billDiscountMinor,
      otherChargesMinor,
      otherChargesNote,
      roundOff,
      payments: toPaymentLines(payments),
      receiveNow,
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
    const fail = (err: unknown) => toast.error(errorMessage(err));
    if (purchase) {
      const { receiveNow: _receiveNow, payments: _payments, ...rest } = parsed.data;
      void _receiveNow; void _payments;
      update.mutate({ id: purchase.id, input: rest }, { onSuccess: (p) => { toast.success('Purchase updated'); onSaved(p); }, onError: fail });
    } else {
      create.mutate({ input: parsed.data as CreatePurchaseInput, idempotencyKey: idem }, { onSuccess: (p) => { toast.success(`Purchase ${p.number} saved${p.status === 'received' ? ' and stock received' : ''}`); onSaved(p); }, onError: fail });
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Supplier invoice</CardTitle><CardDescription>Enter the supplier&apos;s bill as printed. GST is computed per line from the taxable value.</CardDescription></CardHeader>
        <CardContent>
          <FormGrid className="sm:grid-cols-4">
            <FormField label="Supplier" htmlFor="supplier" required error={errors.supplierId} className="sm:col-span-2"><SupplierPicker value={supplierId} onChange={(id, s) => { setSupplierId(id); setSupplier(s ?? null); }} disabled={!!purchase} /></FormField>
            <FormField label="Invoice no." htmlFor="inv" required error={errors.supplierInvoiceNumber}><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></FormField>
            <FormField label="Invoice date" htmlFor="inv-date" required error={errors.invoiceDate}><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></FormField>
            <FormField label="Due date" htmlFor="due" hint={supplier?.paymentTermsDays ? `${supplier.paymentTermsDays}-day terms` : undefined}><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></FormField>
            {supplier ? <div className="sm:col-span-3 flex items-end pb-2 text-[12px] text-fg-subtle">{supplier.gstin ? `GSTIN ${supplier.gstin} · ` : ''}{isInterState(taxCtx) ? 'Inter-state purchase (IGST)' : 'Intra-state purchase (CGST + SGST)'}{supplier.balanceMinor ? ` · payable ${money(supplier.balanceMinor)}` : ''}</div> : null}
          </FormGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle><CardDescription>Prices are per the product&apos;s pricing unit (usually a strip or bottle). Free quantity adds stock without cost.</CardDescription></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead className="bg-surface-muted text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
              <tr><th className="px-3 py-2 w-[260px]">Product</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Free</th><th className="px-2 py-2">Batch</th><th className="px-2 py-2">Expiry</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-right">MRP</th><th className="px-2 py-2 text-right">Selling</th><th className="px-2 py-2 text-right">Disc %</th><th className="px-2 py-2">GST</th><th className="px-2 py-2 text-right">Amount</th><th className="w-8" /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => {
                const lineTotal = computed?.lines[lines.filter((x) => x.product && x.qty && x.purchasePriceMinor !== null).indexOf(l)]?.totalMinor;
                const err = (f: string) => errors[`lines.${i}.${f}`];
                return (
                  <tr key={l.key} className="align-top">
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
              <FormField label="Bill discount %" htmlFor="bd-pct"><PercentInput value={billDiscountBps} onChange={(v) => setBillDiscountBps(v ?? 0)} /></FormField>
              <FormField label="Bill discount ₹" htmlFor="bd-amt"><MoneyInput value={billDiscountMinor} onChange={(v) => setBillDiscountMinor(v ?? 0)} /></FormField>
              <FormField label="Other charges" htmlFor="oc"><MoneyInput value={otherChargesMinor} onChange={(v) => setOtherChargesMinor(v ?? 0)} /></FormField>
              <FormField label="Charges note" htmlFor="oc-note"><Input value={otherChargesNote} onChange={(e) => setOtherChargesNote(e.target.value)} placeholder="Freight" /></FormField>
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
              <div className="mb-1 flex items-center justify-between"><span className="text-[13px] font-medium">Invoice scan / attachments</span><FileUpload purpose="purchaseInvoice" multiple accept="image/*,.pdf" onUploaded={(refs) => setAttachments((a) => [...a, ...refs].slice(0, 5))} label="Upload" /></div>
              <AttachmentList items={attachments} onRemove={(pid) => setAttachments((a) => a.filter((x) => x.publicId !== pid))} />
            </div>
            <FormField label="Notes" htmlFor="notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
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
            <Button loading={pending} disabled={!totals || !supplierId} onClick={submit}>{receiveNow && !purchase ? <PackageCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />} {purchase ? 'Save changes' : receiveNow ? 'Save & receive stock' : 'Save purchase'}</Button>
            <Button variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
