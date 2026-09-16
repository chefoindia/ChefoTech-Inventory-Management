'use client';

import * as React from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import type { AiExtractedInvoice, AiExtractedPurchaseLine, ProductSearchHit } from '@pharmaos/shared';
import { money } from '@/lib/format';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { ProductPicker } from '@/components/ui/pickers';

export type ExtractedProduct = NonNullable<AiExtractedPurchaseLine['product']>;

export interface ReviewedLine {
  productId: string;
  product: ExtractedProduct;
  qty: number;
  freeQty: number;
  batchNumber: string;
  expiryDate: string;
  purchasePriceMinor: number | null;
  mrpMinor: number | null;
  discountBps: number;
  taxRateBps: number | null;
}

interface Row extends Omit<AiExtractedPurchaseLine, 'productId' | 'product'> {
  key: string;
  productId: string | null;
  product: ExtractedProduct | null;
}

const fromHit = (h: ProductSearchHit): ExtractedProduct => ({ name: h.name, packLabel: h.packLabel, units: h.units, pricingUnitId: h.pricingUnitId, baseUnitId: h.baseUnitId, taxRateBps: h.tax.rateBps, cessBps: h.tax.cessBps, mrpMinor: h.pricing.mrpMinor, sellingPriceMinor: h.pricing.sellingPriceMinor });

const CONF: Record<AiExtractedPurchaseLine['confidence'], { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  high: { label: 'Confident', variant: 'success' },
  medium: { label: 'Check', variant: 'warning' },
  low: { label: 'Unsure', variant: 'danger' },
};

/**
 * Review screen for an AI-read supplier invoice. Every value stays editable and nothing is saved here:
 * "Use these lines" only fills the purchase form, which the user still submits.
 */
export function AiInvoiceReview({ result, open, onOpenChange, onApply }: { result: AiExtractedInvoice | null; open: boolean; onOpenChange: (o: boolean) => void; onApply: (lines: ReviewedLine[], header: { supplierId: string | null; invoiceNumber: string | null; invoiceDate: string | null }) => void }) {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [supplierId, setSupplierId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open || !result) return;
    setRows(result.lines.map((l, i) => ({ ...l, key: `${i}-${l.rawName}`, productId: l.productId, product: l.product })));
    setSupplierId(result.supplierId);
  }, [open, result]);
  if (!result) return null;
  const patch = (k: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...p } : r)));
  const ready = rows.filter((r) => r.productId && r.product && r.qty);
  const skipped = rows.length - ready.length;
  const apply = () => {
    onApply(
      ready.map((r) => ({ productId: r.productId!, product: r.product!, qty: r.qty ?? 0, freeQty: r.freeQty ?? 0, batchNumber: r.batchNumber ?? '', expiryDate: r.expiryDate ?? '', purchasePriceMinor: r.purchasePriceMinor, mrpMinor: r.mrpMinor ?? r.product!.mrpMinor ?? null, discountBps: r.discountBps ?? 0, taxRateBps: r.taxRateBps })),
      { supplierId, invoiceNumber: result.invoiceNumber, invoiceDate: result.invoiceDate },
    );
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" title="Invoice read by AI" description="Check every value against the paper invoice. Pick a product for unmatched rows; rows without a product or quantity are skipped.">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-1 font-medium"><Sparkles className="h-3.5 w-3.5 text-primary-600" /> {result.supplierName ?? 'Supplier not read'}</span>
            {result.supplierGstin ? <span className="text-fg-subtle">GSTIN {result.supplierGstin}</span> : null}
            {result.invoiceNumber ? <span className="text-fg-subtle">Invoice {result.invoiceNumber}</span> : null}
            {result.invoiceDate ? <span className="text-fg-subtle">Dated {result.invoiceDate}</span> : null}
            {result.grandTotalMinor !== null ? <span className="text-fg-subtle">Printed total {money(result.grandTotalMinor)}</span> : null}
          </div>
          {result.supplierCandidates.length > 1 || (!supplierId && result.supplierCandidates.length) ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-fg-subtle">Supplier match:</span>
              {result.supplierCandidates.map((c) => (
                <button key={c.id} type="button" onClick={() => setSupplierId(c.id)} className={supplierId === c.id ? 'rounded-full border border-primary-500 bg-primary-50 px-2 py-0.5 text-primary-800' : 'rounded-full border border-border px-2 py-0.5 hover:bg-surface-subtle'}>{c.name}</button>
              ))}
            </div>
          ) : null}
          {result.warnings.length ? (
            <ul className="space-y-0.5 rounded-[var(--radius-control)] border border-warning-600/20 bg-warning-50 px-3 py-2 text-[12px] text-warning-700">
              {result.warnings.map((w, i) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}
            </ul>
          ) : null}
          <div className="max-h-[50vh] overflow-auto rounded-[var(--radius-control)] border border-border">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="sticky top-0 bg-surface-muted text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                <tr><th className="px-3 py-2 w-[300px]">On invoice → product</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Free</th><th className="px-2 py-2">Batch</th><th className="px-2 py-2">Expiry</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-right">MRP</th><th className="px-2 py-2">GST</th><th className="px-2 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.key} className="align-top">
                    <td className="px-3 py-1.5">
                      <div className="mb-1 text-[12px] text-fg-muted">&ldquo;{r.rawName}&rdquo;</div>
                      <ProductPicker value={r.productId} onChange={(id, hit) => patch(r.key, { productId: id, product: hit ? fromHit(hit) : null })} placeholder="Pick the matching product…" />
                      {!r.productId && r.candidates.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.candidates.map((c) => <button key={c.id} type="button" className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-surface-subtle" onClick={() => patch(r.key, { productId: c.id, product: null })} title={c.packLabel}>{c.name}</button>)}
                        </div>
                      ) : null}
                      {r.productId && !r.product ? <div className="mt-1 text-[11px] text-warning-700">Select it from the picker so units and GST load.</div> : null}
                      {r.notes ? <div className="mt-0.5 text-[11px] text-fg-subtle">{r.notes}</div> : null}
                    </td>
                    <td className="px-2 py-1.5"><Input type="number" min={0} className="h-8 w-20 text-right" value={r.qty ?? ''} onChange={(e) => patch(r.key, { qty: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Quantity" /></td>
                    <td className="px-2 py-1.5"><Input type="number" min={0} className="h-8 w-16 text-right" value={r.freeQty ?? ''} onChange={(e) => patch(r.key, { freeQty: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Free quantity" /></td>
                    <td className="px-2 py-1.5"><Input className="h-8 w-28 font-mono" value={r.batchNumber ?? ''} onChange={(e) => patch(r.key, { batchNumber: e.target.value })} aria-label="Batch" /></td>
                    <td className="px-2 py-1.5"><Input type="date" className="h-8 w-36" value={r.expiryDate ?? ''} onChange={(e) => patch(r.key, { expiryDate: e.target.value })} aria-label="Expiry" /></td>
                    <td className="px-2 py-1.5"><MoneyInput className="h-8 w-28" value={r.purchasePriceMinor} onChange={(v) => patch(r.key, { purchasePriceMinor: v })} aria-label="Rate" /></td>
                    <td className="px-2 py-1.5"><MoneyInput className="h-8 w-28" value={r.mrpMinor} onChange={(v) => patch(r.key, { mrpMinor: v })} aria-label="MRP" /></td>
                    <td className="px-2 py-1.5 leading-8 text-fg-muted">{r.taxRateBps !== null ? `${r.taxRateBps / 100}%` : r.product ? `${r.product.taxRateBps / 100}%` : '—'}</td>
                    <td className="px-2 py-1.5"><Badge variant={CONF[r.confidence].variant}>{CONF[r.confidence].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-fg-subtle">{ready.length} line{ready.length === 1 ? '' : 's'} ready{skipped ? `, ${skipped} will be skipped (no product or quantity)` : ''}. The purchase is not saved until you submit the form.</p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={apply} disabled={!ready.length}>Use these lines</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
