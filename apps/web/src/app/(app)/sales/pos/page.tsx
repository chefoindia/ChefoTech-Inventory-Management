'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Trash2, PauseCircle, CheckCircle2, X, ScanBarcode, FileText, ListChecks, Printer, Mail, Plus, AlertTriangle } from 'lucide-react';
import type { ProductSearchHit, ProductDto, SaleQuoteDto, SaleDto, HoldSaleInput } from '@pharmaos/shared';
import { useSession } from '@/stores/session';
import { usePermission } from '@/features/auth/permissions';
import { useProductSearch, lookupBarcode } from '@/features/catalog/api';
import { useQuoteSale, useCreateSale, useHoldSale, useHeldSales, useDeleteHeld, fetchHeld } from '@/features/sales/api';
import { usePrescriptions } from '@/features/prescriptions/api';
import { openDocument } from '@/features/documents/api';
import { api, errorMessage, ApiError } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { useDebounce } from '@/hooks/use-debounce';
import { money, baseToDisplay } from '@/lib/format';
import { formatDate, relativeTime, cn } from '@/lib/utils';
import { type CartLine, type CartHeader, type CartProduct, toCartProduct, defaultSaleUnit, lineKey, toSaleLines, emptyHeader, toHoldInput, unitFactor } from '@/features/sales/pos-state';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { MoneyInput, PercentInput } from '@/components/ui/money-input';
import { Badge } from '@/components/ui/badge';
import { Kbd } from '@/components/ui/kbd';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { CustomerPicker } from '@/components/ui/pickers';
import { PaymentLines, toPaymentLines, type PaymentDraft } from '@/components/ui/payment-lines';
import { TotalsPanel } from '@/components/ui/totals-panel';
import { EmailDialog } from '@/components/documents/document-actions';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';
import { FormField } from '@/components/ui/form-field';

/* ------------------------------------------------------------------ search */

function ProductSearch({ onPick, inputRef }: { onPick: (p: ProductSearchHit) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const [q, setQ] = React.useState('');
  const dq = useDebounce(q, 150);
  const search = useProductSearch(dq, true, 12);
  const [active, setActive] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const results = search.data ?? [];
  React.useEffect(() => setActive(0), [results]);

  const pick = (p: ProductSearchHit) => {
    onPick(p);
    setQ('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const scan = async (code: string) => {
    setScanning(true);
    try {
      const hit = await lookupBarcode(code);
      pick(hit);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) toast.error(`No product with barcode ${code}`);
      else toast.error(errorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const onKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); setOpen(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Escape') { setQ(''); setOpen(false); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = q.trim();
      if (!trimmed) return;
      // Scanner input arrives faster than the debounce; a digit-only/long code is looked up as a barcode first.
      if (/^[A-Za-z0-9\-_.]{6,}$/.test(trimmed) && (dq !== trimmed || results.length === 0)) return void scan(trimmed);
      const hit = results[active];
      if (hit) pick(hit);
      else if (trimmed.length >= 3) void scan(trimmed);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-fg-faint" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => void onKey(e)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Scan barcode or search product…  (F2)"
          aria-label="Search products or scan barcode"
          autoComplete="off"
          className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-surface pl-9 pr-10 text-sm shadow-sm focus:border-primary-500"
        />
        <ScanBarcode className={cn('absolute right-3 top-3 h-4 w-4', scanning ? 'animate-pulse text-primary-600' : 'text-fg-faint')} />
      </div>
      {open && q.trim() ? (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto scroll-thin rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-[var(--shadow-popover)]">
          {search.isFetching && results.length === 0 ? <li className="px-3 py-2 text-[13px] text-fg-subtle">Searching…</li> : null}
          {!search.isFetching && results.length === 0 && dq ? <li className="px-3 py-2 text-[13px] text-fg-subtle">No products. Press Enter to try as a barcode.</li> : null}
          {results.map((p, i) => {
            const stock = p.stockBase ?? 0;
            const pricing = p.units.find((u) => u.unitId === p.pricingUnitId);
            const base = p.units.find((u) => u.unitId === p.baseUnitId);
            return (
              <li key={p.id} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)} className={cn('flex cursor-pointer items-center gap-3 rounded-[4px] px-3 py-2', i === active && 'bg-primary-50')}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium"><span className="truncate">{p.name}</span>{p.requiresPrescription ? <Badge variant="warning">Rx</Badge> : null}</span>
                  <span className="block truncate text-[12px] text-fg-subtle">{[p.packLabel, p.manufacturer, p.composition].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-right">
                  <span className="block tabular text-sm">{money(p.pricing.sellingPriceMinor || p.pricing.mrpMinor)}</span>
                  <span className={cn('block text-[12px]', stock > 0 ? 'text-success-700' : 'text-danger-600')}>{stock > 0 ? (pricing && base ? baseToDisplay(stock, pricing.factorToBase, pricing.abbreviation, base.abbreviation) : `${stock}`) : 'Out of stock'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function PosPage() {
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  const outletId = useSession((s) => s.activeOutletId);
  const outlet = me.outlets.find((o) => o.id === outletId);
  const canCreate = usePermission('sales.create');
  const canDiscount = usePermission('sales.discount');
  const canOverridePrice = usePermission('sales.overridePrice');
  const canChooseBatch = usePermission('sales.chooseBatch');
  const canCredit = usePermission('sales.credit');
  const canHold = usePermission('sales.hold');
  const canEmail = usePermission('sales.email');
  const canPrint = usePermission('sales.print');

  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [header, setHeader] = React.useState<CartHeader>(emptyHeader);
  const [payments, setPayments] = React.useState<PaymentDraft[]>([{ method: 'cash', amountMinor: null, reference: '' }]);
  const [creditMinor, setCreditMinor] = React.useState(0);
  const [dueDate, setDueDate] = React.useState('');
  const [sendEmail, setSendEmail] = React.useState(false);
  const [heldId, setHeldId] = React.useState<string | undefined>(undefined);
  const [quote, setQuote] = React.useState<SaleQuoteDto | null>(null);
  const [idemKey, setIdemKey] = React.useState(newIdempotencyKey);
  const [heldOpen, setHeldOpen] = React.useState(false);
  const [holdOpen, setHoldOpen] = React.useState(false);
  const [completed, setCompleted] = React.useState<SaleDto | null>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const payRef = React.useRef<HTMLDivElement>(null);

  const quoteMut = useQuoteSale();
  const createSale = useCreateSale();
  const hold = useHoldSale();
  const held = useHeldSales();
  const deleteHeld = useDeleteHeld();
  const prescriptions = usePrescriptions({ page: 1, customerId: header.customerId ?? undefined, status: 'active' });

  // live quote
  const quoteInput = React.useMemo(() => ({ customerId: header.customerId ?? undefined, lines: toSaleLines(lines), billDiscountBps: header.billDiscountBps, billDiscountMinor: header.billDiscountMinor }), [lines, header.customerId, header.billDiscountBps, header.billDiscountMinor]);
  const debouncedQuote = useDebounce(quoteInput, 250);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (debouncedQuote.lines.length === 0) { setQuote(null); setQuoteError(null); return; }
    quoteMut.mutate(debouncedQuote, { onSuccess: (q) => { setQuote(q); setQuoteError(null); }, onError: (err) => setQuoteError(errorMessage(err)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuote]);

  const grandTotal = quote?.totals.grandTotalMinor ?? 0;
  const paid = payments.reduce((s, p) => s + (p.amountMinor ?? 0), 0);
  const due = grandTotal - paid - creditMinor;

  // auto-fill the single cash line with the grand total while the user hasn't touched it
  const touchedPay = React.useRef(false);
  React.useEffect(() => {
    if (!touchedPay.current && payments.length === 1) setPayments([{ ...payments[0]!, amountMinor: grandTotal > 0 ? grandTotal - creditMinor : null }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotal, creditMinor]);

  const addProduct = React.useCallback((hit: ProductSearchHit) => {
    const product = toCartProduct(hit);
    const unitId = defaultSaleUnit(product);
    setLines((ls) => {
      const existing = ls.find((l) => l.product.id === product.id && l.unitId === unitId && !l.batchId);
      if (existing) return ls.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: lineKey(), product, unitId, qty: 1, discountBps: 0, discountMinor: 0, note: '' }];
    });
  }, []);

  const updateLine = (key: string, patch: Partial<CartLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const reset = React.useCallback(() => {
    setLines([]);
    setHeader(emptyHeader);
    setPayments([{ method: 'cash', amountMinor: null, reference: '' }]);
    setCreditMinor(0);
    setDueDate('');
    setSendEmail(false);
    setHeldId(undefined);
    setQuote(null);
    setIdemKey(newIdempotencyKey());
    touchedPay.current = false;
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  // Offline resilience: the bill being typed survives a refresh, tab crash or connection drop.
  // Nothing financial happens locally; completing still requires the server (with an idempotency key).
  const draftKey = `pharmaos.posDraft.${me.user.id}.${outletId ?? 'none'}`;
  const restored = React.useRef(false);
  React.useEffect(() => {
    if (restored.current || !outletId) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { lines: CartLine[]; header: CartHeader; heldId?: string; savedAt: string };
      if (draft.lines?.length) {
        setLines(draft.lines);
        setHeader({ ...emptyHeader, ...draft.header });
        setHeldId(draft.heldId);
        toast.info(`Restored the bill you were typing (${draft.lines.length} item${draft.lines.length === 1 ? '' : 's'}).`);
      }
    } catch {
      /* corrupt draft: ignore */
    }
  }, [draftKey, outletId]);
  React.useEffect(() => {
    if (!restored.current) return;
    try {
      if (lines.length === 0) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey, JSON.stringify({ lines, header, heldId, savedAt: new Date().toISOString() }));
    } catch {
      /* storage unavailable: drafts simply are not preserved */
    }
  }, [lines, header, heldId, draftKey]);

  const complete = React.useCallback(() => {
    if (!quote || lines.length === 0 || createSale.isPending) return;
    if (due > 0) return toast.error(`${money(due)} still unpaid. Add a payment or credit.`);
    if (creditMinor > 0 && !header.customerId) return toast.error('Credit (Baki) needs a saved customer.');
    createSale.mutate(
      {
        idempotencyKey: idemKey,
        input: {
          customerId: header.customerId ?? undefined,
          walkIn: header.customerId ? undefined : { name: header.walkInName, phone: header.walkInPhone || undefined, email: undefined },
          prescriptionIds: header.prescriptionIds,
          doctorName: header.doctorName,
          lines: toSaleLines(lines),
          billDiscountBps: header.billDiscountBps,
          billDiscountMinor: header.billDiscountMinor,
          payments: toPaymentLines(payments),
          creditMinor,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          notes: header.notes,
          customFields: header.customFields,
          heldSaleId: heldId,
          expectedGrandTotalMinor: quote.totals.grandTotalMinor,
          sendEmail,
        },
      },
      {
        onSuccess: (sale) => {
          setCompleted(sale);
          if (outlet?.settings.autoPrintOnSale && canPrint) openDocument(outlet.settings.defaultPrinter?.startsWith('thermal') ? 'saleReceipt' : 'saleInvoice', sale.id, { print: true }).catch((e) => toast.error(errorMessage(e)));
        },
        onError: (err) => {
          toast.error(errorMessage(err));
          // The failed attempt created nothing; a corrected retry is a new request and needs a fresh key.
          if (!(err instanceof ApiError) || err.status !== 409) setIdemKey(newIdempotencyKey());
        },
      },
    );
  }, [quote, lines, createSale, due, creditMinor, header, idemKey, payments, dueDate, heldId, sendEmail, outlet, canPrint]);

  const holdNow = (label: string) => {
    if (lines.length === 0) return;
    hold.mutate({ ...toHoldInput({ ...header, label }, lines) }, { onSuccess: () => { toast.success('Bill held'); setHoldOpen(false); reset(); }, onError: (err) => toast.error(errorMessage(err)) });
  };

  const resumeHeld = async (id: string) => {
    try {
      const h = await fetchHeld(id);
      const input: HoldSaleInput = h.input;
      const byId = new Map<string, CartProduct>();
      await Promise.all([...new Set(input.lines.map((l) => l.productId))].map(async (pid) => {
        const p = await api.get<ProductDto>(`/products/${pid}`);
        byId.set(pid, { id: p.id, name: p.name, packLabel: p.packLabel, requiresPrescription: p.requiresPrescription, schedule: p.schedule, units: p.units, baseUnitId: p.baseUnitId, pricingUnitId: p.pricingUnitId, mrpMinor: p.pricing.mrpMinor, sellingPriceMinor: p.pricing.sellingPriceMinor, stockBase: p.stockBase });
      }));
      setLines(input.lines.map((l) => ({ key: lineKey(), product: byId.get(l.productId)!, batchId: l.batchId, unitId: l.unitId, qty: l.qty, unitPriceMinor: l.unitPriceMinor, discountBps: l.discountBps ?? 0, discountMinor: l.discountMinor ?? 0, note: l.note ?? '' })));
      setHeader({ ...emptyHeader, customerId: input.customerId ?? null, walkInName: input.walkIn?.name ?? '', walkInPhone: input.walkIn?.phone ?? '', doctorName: input.doctorName ?? '', prescriptionIds: input.prescriptionIds ?? [], billDiscountBps: input.billDiscountBps ?? 0, billDiscountMinor: input.billDiscountMinor ?? 0, notes: input.notes ?? '', customFields: (input.customFields ?? {}) as Record<string, unknown>, label: h.label });
      setHeldId(id);
      setHeldOpen(false);
      toast.success(`Resumed ${h.label || 'held bill'}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (completed) return;
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'F8') { e.preventDefault(); payRef.current?.querySelector('input')?.focus(); }
      else if (e.key === 'F9' && canHold) { e.preventDefault(); setHoldOpen(true); }
      else if (e.key === 'F12' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); complete(); }
      else if (e.key === 'F7') { e.preventDefault(); setHeldOpen(true); }
      else if (e.key === 'F4') { e.preventDefault(); document.getElementById('pos-customer')?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [complete, canHold, completed]);

  React.useEffect(() => { searchRef.current?.focus(); }, []);

  if (!canCreate) return <div className="py-20 text-center text-sm text-fg-subtle">Your role cannot create sales.</div>;
  if (!outletId) return <div className="py-20 text-center text-sm text-fg-subtle">Select an outlet to start billing.</div>;

  const quoteByIndex = new Map<number, SaleQuoteDto['lines']>();
  quote?.lines.forEach((ql) => { const arr = quoteByIndex.get(ql.lineIndex) ?? []; arr.push(ql); quoteByIndex.set(ql.lineIndex, arr); });

  return (
    <div className="-mx-4 -my-5 flex min-h-[calc(100vh-56px)] flex-col sm:-mx-6 lg:-mx-8">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <h1 className="text-[15px] font-semibold">Point of sale</h1>
        <span className="text-[12px] text-fg-subtle">{outlet?.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setHeldOpen(true)}><ListChecks className="h-3.5 w-3.5" /> Held bills{held.data?.length ? <Badge variant="primary">{held.data.length}</Badge> : null} <Kbd>F7</Kbd></Button>
          <Link href="/sales" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Invoices</Link>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_380px]">
        {/* left: search + cart */}
        <div className="flex min-w-0 flex-col border-r border-border">
          <div className="p-3"><ProductSearch onPick={addProduct} inputRef={searchRef} /></div>
          <div className="flex-1 overflow-x-auto">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-20 text-center text-fg-subtle">
                <ScanBarcode className="h-8 w-8 text-fg-faint" />
                <p className="mt-3 text-sm">Scan a barcode or search to add items.</p>
                <p className="mt-1 text-[12px]"><Kbd>F2</Kbd> search · <Kbd>F8</Kbd> payment · <Kbd>F9</Kbd> hold · <Kbd>F12</Kbd> complete</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-[12px] font-medium uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-2 py-2">Batch</th>
                    <th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Price</th>
                    {canDiscount ? <th className="px-2 py-2 text-right">Disc %</th> : null}
                    <th className="px-2 py-2 text-right">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, i) => {
                    const ql = quoteByIndex.get(i) ?? [];
                    const total = ql.reduce((s, x) => s + x.totalMinor, 0);
                    const unit = l.product.units.find((u) => u.unitId === l.unitId);
                    const available = ql.length ? ql.reduce((s, x) => s + x.availableBase, 0) : l.product.stockBase;
                    const short = available !== undefined && available < l.qty * unitFactor(l.product, l.unitId);
                    const price = ql[0]?.unitPriceMinor;
                    return (
                      <tr key={l.key} className={cn(short && 'bg-danger-50/40')}>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2 font-medium"><span className="truncate">{l.product.name}</span>{l.product.requiresPrescription ? <Badge variant="warning">Rx</Badge> : null}</div>
                          <div className="text-[12px] text-fg-subtle">{l.product.packLabel}{short ? <span className="ml-2 text-danger-600">Only {available} {l.product.units.find((u) => u.unitId === l.product.baseUnitId)?.abbreviation} available</span> : null}</div>
                        </td>
                        <td className="px-2 py-1.5">
                          {canChooseBatch && l.product.batches?.length ? (
                            <Select className="h-8 w-40 text-[12px]" value={l.batchId ?? ''} onChange={(e) => updateLine(l.key, { batchId: e.target.value || undefined })} aria-label="Batch">
                              <option value="">Auto (FEFO)</option>
                              {l.product.batches.filter((b) => !b.isExpired).map((b) => <option key={b.batchId} value={b.batchId}>{b.batchNumber} · {formatDate(b.expiryDate, { month: 'short', year: '2-digit' })} · {b.qtyBase}</option>)}
                            </Select>
                          ) : (
                            <span className="text-[12px] text-fg-subtle">{ql.map((x) => `${x.batchNumber} (${formatDate(x.expiryDate, { month: 'short', year: '2-digit' })})`).join(', ') || 'FEFO'}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select className="h-8 w-28 text-[12px]" value={l.unitId} onChange={(e) => updateLine(l.key, { unitId: e.target.value, unitPriceMinor: undefined })} aria-label="Unit">
                            {l.product.units.filter((u) => u.allowLooseSale || u.unitId === l.product.pricingUnitId || u.factorToBase > 1).map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}
                          </Select>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" min={unit && l.product.units.find((u) => u.unitId === l.unitId)?.factorToBase === 1 ? 1 : 0.01} step={1} value={l.qty} onChange={(e) => updateLine(l.key, { qty: Math.max(Number(e.target.value) || 0, 0) })} onKeyDown={(e) => { if (e.key === 'Enter') searchRef.current?.focus(); }} className="h-8 w-16 rounded border border-border px-2 text-right tabular focus:border-primary-500" aria-label="Quantity" />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular">
                          {canOverridePrice ? (
                            <MoneyInput className="h-8 w-24 text-[13px]" value={l.unitPriceMinor ?? price ?? null} onChange={(v) => updateLine(l.key, { unitPriceMinor: v ?? undefined })} aria-label="Unit price" />
                          ) : (
                            <span>{price !== undefined ? money(price) : '—'}</span>
                          )}
                          {ql[0] && ql[0].mrpPerUnitMinor !== (l.unitPriceMinor ?? price) ? <span className="block text-[11px] text-fg-subtle">MRP {money(ql[0].mrpPerUnitMinor)}</span> : null}
                        </td>
                        {canDiscount ? (
                          <td className="px-2 py-1.5 text-right"><PercentInput className="h-8 w-20 text-[13px]" value={l.discountBps} onChange={(v) => updateLine(l.key, { discountBps: v ?? 0 })} aria-label="Line discount" /></td>
                        ) : null}
                        <td className="px-2 py-1.5 text-right tabular font-medium">{money(total)}</td>
                        <td className="px-1 py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Remove line" onClick={() => removeLine(l.key)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {quote?.warnings.length ? (
            <ul className="space-y-1 border-t border-border bg-warning-50 px-4 py-2 text-[12px] text-warning-700">
              {quote.warnings.map((w, i) => <li key={i} className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{w}</li>)}
            </ul>
          ) : null}
          {quoteError ? <div className="border-t border-border bg-danger-50 px-4 py-2 text-[12px] text-danger-700">{quoteError}</div> : null}
        </div>

        {/* right: customer, totals, payment */}
        <div className="flex flex-col gap-4 bg-surface-muted/60 p-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between"><h2 className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Customer</h2><Kbd>F4</Kbd></div>
            <CustomerPicker id="pos-customer" value={header.customerId} onChange={(id, c) => setHeader((h) => ({ ...h, customerId: id, customerName: c?.name ?? '', customerPhone: c?.phone ?? '', prescriptionIds: [], billDiscountBps: c?.defaultDiscountBps && canDiscount ? c.defaultDiscountBps : h.billDiscountBps }))} />
            {!header.customerId ? (
              <div className="grid grid-cols-2 gap-2">
                <Input className="h-8" placeholder="Walk-in name" value={header.walkInName} onChange={(e) => setHeader((h) => ({ ...h, walkInName: e.target.value }))} aria-label="Walk-in name" />
                <Input className="h-8" placeholder="Phone" inputMode="tel" value={header.walkInPhone} onChange={(e) => setHeader((h) => ({ ...h, walkInPhone: e.target.value }))} aria-label="Walk-in phone" />
              </div>
            ) : quote ? (
              <div className="flex items-center justify-between text-[12px] text-fg-subtle"><span>Balance {money(quote.customerBalanceMinor)}</span>{quote.creditLimitMinor ? <span>Limit {money(quote.creditLimitMinor)}</span> : null}</div>
            ) : null}
            {(quote?.requiresPrescription || lines.some((l) => l.product.requiresPrescription)) ? (
              <div className="rounded-[var(--radius-control)] border border-warning-600/30 bg-warning-50 p-2 text-[12px]">
                <div className="flex items-center gap-1.5 font-medium text-warning-700"><FileText className="h-3.5 w-3.5" /> Prescription items in this bill</div>
                <Input className="mt-2 h-8" placeholder="Doctor name" value={header.doctorName} onChange={(e) => setHeader((h) => ({ ...h, doctorName: e.target.value }))} aria-label="Doctor name" />
                {header.customerId ? (
                  <div className="mt-2 space-y-1">
                    {(prescriptions.data?.items ?? []).map((rx) => (
                      <label key={rx.id} className="flex items-center gap-2"><input type="checkbox" className="h-3.5 w-3.5 accent-primary-600" checked={header.prescriptionIds.includes(rx.id)} onChange={(e) => setHeader((h) => ({ ...h, prescriptionIds: e.target.checked ? [...h.prescriptionIds, rx.id] : h.prescriptionIds.filter((x) => x !== rx.id), doctorName: h.doctorName || rx.doctorName }))} /> {rx.doctorName} · {formatDate(rx.prescriptionDate)}</label>
                    ))}
                    <Link href={`/prescriptions?new=1&customerId=${header.customerId}`} className="inline-flex items-center gap-1 text-primary-700 hover:underline"><Plus className="h-3 w-3" /> Add prescription</Link>
                  </div>
                ) : <p className="mt-1 text-fg-subtle">Select a saved customer to attach a prescription.</p>}
              </div>
            ) : null}
          </section>

          <section className="space-y-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Totals</h2>
            {canDiscount ? (
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-fg-muted">Bill discount</span>
                <PercentInput className="h-8 w-20" value={header.billDiscountBps} onChange={(v) => setHeader((h) => ({ ...h, billDiscountBps: v ?? 0 }))} aria-label="Bill discount percent" />
                <MoneyInput className="h-8 w-28" value={header.billDiscountMinor} onChange={(v) => setHeader((h) => ({ ...h, billDiscountMinor: v ?? 0 }))} aria-label="Bill discount amount" />
              </div>
            ) : null}
            <TotalsPanel totals={quote?.totals ?? { subtotalMinor: 0, itemDiscountMinor: 0, billDiscountMinor: 0, taxableMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, cessMinor: 0, taxMinor: 0, otherChargesMinor: 0, roundOffMinor: 0, grandTotalMinor: 0 }} isInterState={quote?.isInterState} />
          </section>

          <section className="space-y-2" ref={payRef}>
            <div className="flex items-center justify-between"><h2 className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Payment</h2><Kbd>F8</Kbd></div>
            <div onChangeCapture={() => { touchedPay.current = true; }}>
              <PaymentLines value={payments} onChange={setPayments} total={grandTotal - creditMinor} />
            </div>
            {canCredit ? (
              <div className="flex items-center gap-2 text-[13px]">
                <span className="w-24 text-fg-muted">Credit (Baki)</span>
                <MoneyInput className="h-8" value={creditMinor} onChange={(v) => { touchedPay.current = true; setCreditMinor(v ?? 0); }} disabled={!header.customerId} aria-label="Credit amount" />
                <Input type="date" className="h-8 w-36" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!creditMinor} aria-label="Due date" />
              </div>
            ) : null}
            {canCredit && creditMinor > 0 && !header.customerId ? <p className="text-[12px] text-danger-600">Credit needs a saved customer.</p> : null}
          </section>

          <div className="mt-auto space-y-2">
            <div className="flex items-center justify-between text-[12px] text-fg-subtle">
              <button type="button" className="hover:underline" onClick={() => setMoreOpen(true)}>Notes & more…</button>
              {canEmail ? <label className="flex items-center gap-1.5"><input type="checkbox" className="h-3.5 w-3.5 accent-primary-600" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email invoice</label> : null}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={reset} disabled={lines.length === 0}><X className="h-4 w-4" /> Clear</Button>
              {canHold ? <Button variant="secondary" onClick={() => setHoldOpen(true)} disabled={lines.length === 0}><PauseCircle className="h-4 w-4" /> Hold <Kbd>F9</Kbd></Button> : <span />}
              <Button size="lg" className="col-span-3" loading={createSale.isPending} disabled={!quote || lines.length === 0 || due !== 0 || quoteMut.isPending} onClick={complete}>
                <CheckCircle2 className="h-4 w-4" /> Complete sale · {money(grandTotal)} <Kbd className="ml-1 border-white/40 bg-white/10 text-white">F12</Kbd>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* held bills */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent title="Held bills" description="Parked bills at this outlet. Resume to continue billing." size="md">
          {!held.data?.length ? <p className="text-sm text-fg-subtle">Nothing on hold.</p> : (
            <ul className="divide-y divide-border">
              {held.data.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{h.label || 'Untitled'} · {h.customerName || 'Walk-in'}</span>
                    <span className="block text-[12px] text-fg-subtle">{h.lineCount} items · {money(h.estimatedTotalMinor)} · {h.heldBy?.name} · {relativeTime(h.createdAt)}</span>
                  </span>
                  <Button size="sm" onClick={() => void resumeHeld(h.id)}>Resume</Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete held bill" onClick={() => deleteHeld.mutate(h.id, { onError: (e) => toast.error(errorMessage(e)) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <HoldDialog open={holdOpen} onOpenChange={setHoldOpen} defaultLabel={header.label || header.customerName || header.walkInName} loading={hold.isPending} onHold={holdNow} />

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent title="Notes & custom fields" size="md">
          <div className="space-y-4">
            <FormField label="Notes" htmlFor="pos-notes"><Textarea value={header.notes} onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))} /></FormField>
            <CustomFieldsForm entity="sale" values={header.customFields} onChange={(v) => setHeader((h) => ({ ...h, customFields: v }))} />
          </div>
          <DialogFooter><Button onClick={() => setMoreOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <CompletedDialog sale={completed} canPrint={canPrint} canEmail={canEmail} onClose={() => { setCompleted(null); reset(); }} onView={() => { const id = completed?.id; setCompleted(null); reset(); if (id) router.push(`/sales/${id}`); }} />
    </div>
  );
}

function HoldDialog({ open, onOpenChange, defaultLabel, loading, onHold }: { open: boolean; onOpenChange: (o: boolean) => void; defaultLabel: string; loading: boolean; onHold: (label: string) => void }) {
  const [label, setLabel] = React.useState(defaultLabel);
  React.useEffect(() => { if (open) setLabel(defaultLabel); }, [open, defaultLabel]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Hold this bill" description="Park the bill so another customer can be served. Stock is not reserved." size="sm">
        <FormField label="Label" htmlFor="hold-label" hint="Customer name, token number…">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') onHold(label); }} />
        </FormField>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={loading} onClick={() => onHold(label)}>Hold bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompletedDialog({ sale, canPrint, canEmail, onClose, onView }: { sale: SaleDto | null; canPrint: boolean; canEmail: boolean; onClose: () => void; onView: () => void }) {
  const [emailOpen, setEmailOpen] = React.useState(false);
  React.useEffect(() => {
    if (!sale) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sale, onClose]);
  if (!sale) return null;
  const run = (type: 'saleInvoice' | 'saleReceipt') => openDocument(type, sale.id, { print: true }).catch((e) => toast.error(errorMessage(e)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Invoice ${sale.number}`} description={`${money(sale.totals.grandTotalMinor)} · ${sale.paymentStatus === 'paid' ? 'Paid' : sale.paymentStatus === 'credit' ? 'On credit' : 'Partially paid'}${sale.customer.name ? ` · ${sale.customer.name}` : ''}`} size="sm">
        <div className="flex flex-col items-center py-2 text-center">
          <CheckCircle2 className="h-10 w-10 text-success-600" />
          <p className="mt-2 text-sm text-fg-muted">Sale completed. Press <Kbd>Enter</Kbd> for the next customer.</p>
          {sale.emailStatus !== 'none' ? <p className="mt-1 text-[12px] text-fg-subtle">Email {sale.emailStatus}{sale.emailedTo ? ` to ${sale.emailedTo}` : ''}</p> : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {canPrint ? <Button variant="secondary" onClick={() => void run('saleInvoice')}><Printer className="h-4 w-4" /> A4 invoice</Button> : null}
          {canPrint ? <Button variant="secondary" onClick={() => void run('saleReceipt')}><Printer className="h-4 w-4" /> Thermal receipt</Button> : null}
          {canEmail ? <Button variant="secondary" onClick={() => setEmailOpen(true)}><Mail className="h-4 w-4" /> Email</Button> : null}
          <Button variant="secondary" onClick={onView}>Open invoice</Button>
        </div>
        <DialogFooter><Button onClick={onClose} autoFocus>New sale</Button></DialogFooter>
        <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} type="saleInvoice" refId={sale.id} defaultTo={sale.customer.email} />
      </DialogContent>
    </Dialog>
  );
}
