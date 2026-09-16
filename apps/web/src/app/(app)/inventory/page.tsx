'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Boxes, CalendarClock, PackageSearch, ArrowLeftRight, ClipboardEdit, Download, Plus, Ban, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import type { StockOverviewRow, BatchRow, MovementRow, AdjustmentDto, TransferDto } from '@pharmaos/shared';
import { useStock, useLowStock, useBatches, useMovements, useExpirySummary, useAdjustments, useTransfers, useUpdateBatch, useBlockBatch, useWriteOff } from '@/features/inventory/api';
import { useCategories } from '@/features/catalog/api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { useDebounce } from '@/hooks/use-debounce';
import { downloadFile } from '@/features/reports/api';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { money, moneyCompact, expiryLabel, dateInput } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, Stat } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { Badge, DocStatusBadge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, useListState, type Column } from '@/components/ui/data-table';
import { DateRangePicker, defaultRange, rangeToQuery, type DateRange } from '@/components/ui/date-range';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { MoneyInput } from '@/components/ui/money-input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProductPicker } from '@/components/ui/pickers';
import { Skeleton } from '@/components/ui/states';

export default function InventoryPage() {
  return <Suspense><InventoryInner /></Suspense>;
}

function InventoryInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') ?? 'stock';
  const canOpening = usePermission('inventory.openingStock');
  const canAdjust = usePermission('inventory.adjust');
  const canTransfer = usePermission('inventory.transfer.create');
  const outletId = useSession((s) => s.activeOutletId);
  if (!outletId) return <div className="py-20 text-center text-sm text-fg-subtle">Select an outlet to view its stock.</div>;
  return (
    <>
      <PageHeader title="Inventory" description="Stock on hand, batches, expiry, movements and approvals for this outlet." actions={<>
        {canOpening ? <Link href="/inventory/opening-stock" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Opening stock</Link> : null}
        {canTransfer ? <Link href="/inventory/transfers/new" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><ArrowLeftRight className="h-3.5 w-3.5" /> Transfer</Link> : null}
        {canAdjust ? <Link href="/inventory/adjustments/new" className={buttonVariants({ size: 'sm' })}><ClipboardEdit className="h-3.5 w-3.5" /> Adjustment</Link> : null}
      </>} />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/inventory?tab=${v}`)}>
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="expiry">Expiry</TabsTrigger>
          <TabsTrigger value="low-stock">Low stock</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>
        <TabsContent value="stock"><StockTab /></TabsContent>
        <TabsContent value="batches"><BatchesTab initialProductId={params.get('productId') ?? undefined} /></TabsContent>
        <TabsContent value="expiry"><ExpiryTab /></TabsContent>
        <TabsContent value="low-stock"><LowStockTab /></TabsContent>
        <TabsContent value="movements"><MovementsTab /></TabsContent>
        <TabsContent value="adjustments"><AdjustmentsTab /></TabsContent>
        <TabsContent value="transfers"><TransfersTab /></TabsContent>
      </Tabs>
    </>
  );
}

function StockTab() {
  const router = useRouter();
  const { page, setPage, filters, setFilter } = useListState({ q: '', categoryId: '', onlyInStock: '1' });
  const q = useDebounce(filters.q ?? '', 250);
  const stock = useStock({ page, q: q || undefined, categoryId: filters.categoryId || undefined, onlyInStock: filters.onlyInStock === '1' });
  const categories = useCategories();
  const canValuation = usePermission('inventory.viewValuation');
  const canExport = usePermission('data.export');
  const [exporting, setExporting] = useState(false);
  const columns: Column<StockOverviewRow>[] = [
    { key: 'product', header: 'Product', cell: (r) => <div><div className="font-medium">{r.name}</div><div className="text-[12px] text-fg-subtle">{[r.packLabel, r.manufacturer, r.categoryName].filter(Boolean).join(' · ')}</div></div> },
    { key: 'onhand', header: 'On hand', numeric: true, cell: (r) => <span className={r.isLow ? 'font-medium text-danger-600' : 'font-medium'}>{r.onHandBase} {r.baseUnit}</span> },
    { key: 'sellable', header: 'Sellable', numeric: true, cell: (r) => r.sellableBase },
    { key: 'exp', header: 'Expired / near', numeric: true, cell: (r) => <span>{r.expiredBase ? <span className="text-danger-600">{r.expiredBase}</span> : '0'} / {r.nearExpiryBase ? <span className="text-warning-700">{r.nearExpiryBase}</span> : '0'}</span> },
    { key: 'transit', header: 'In transit', numeric: true, cell: (r) => r.inTransitBase || '—' },
    { key: 'reorder', header: 'Reorder at', numeric: true, cell: (r) => r.reorderLevelBase || '—' },
    { key: 'batches', header: 'Batches', numeric: true, cell: (r) => r.batchCount },
    { key: 'next', header: 'Next expiry', cell: (r) => r.nextExpiry ? <Badge variant={expiryLabel(r.nextExpiry).tone === 'neutral' ? 'neutral' : expiryLabel(r.nextExpiry).tone}>{formatDate(r.nextExpiry, { month: 'short', year: '2-digit' })}</Badge> : '—' },
    ...(canValuation ? [{ key: 'val', header: 'Value (cost)', numeric: true, cell: (r: StockOverviewRow) => r.valuationCostMinor !== undefined ? money(r.valuationCostMinor) : '—' }] : []),
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-faint" /><Input className="h-9 pl-8" placeholder="Search product…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search stock" /></div>
        <Select className="h-9 w-44" value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)} aria-label="Category"><option value="">All categories</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.path || c.name}</option>)}</Select>
        <label className="flex items-center gap-2 text-[13px] text-fg-muted"><Checkbox checked={filters.onlyInStock === '1'} onChange={(e) => setFilter('onlyInStock', e.target.checked ? '1' : '')} /> In stock only</label>
        {canExport ? <Button variant="secondary" size="sm" loading={exporting} onClick={async () => { setExporting(true); try { await downloadFile('/exports/stock?format=xlsx', 'stock.xlsx'); } catch (e) { toast.error(errorMessage(e)); } finally { setExporting(false); } }}><Download className="h-3.5 w-3.5" /> Export</Button> : null}
      </div>
      <DataTable columns={columns} rows={stock.data?.items} rowKey={(r) => r.productId} isPending={stock.isPending} isError={stock.isError} error={stock.error} onRetry={() => stock.refetch()} meta={stock.data?.meta} onPageChange={setPage} onRowClick={(r) => router.push(`/products/${r.productId}`)} empty={{ icon: Boxes, title: 'No stock yet', description: 'Receive a purchase or post opening stock to get started.' }} />
    </Card>
  );
}

function BatchesTab({ initialProductId }: { initialProductId?: string }) {
  const { page, setPage, filters, setFilter } = useListState({ q: '', expiryStatus: 'all', includeZero: '' });
  const [productId, setProductId] = useState<string | null>(initialProductId ?? null);
  const q = useDebounce(filters.q ?? '', 250);
  const batches = useBatches({ page, q: q || undefined, productId: productId ?? undefined, expiryStatus: filters.expiryStatus, includeZero: filters.includeZero === '1' });
  const canCost = usePermission('products.viewCost');
  const canEdit = usePermission('inventory.adjust');
  const canWriteOff = usePermission('inventory.writeOff');
  const [editing, setEditing] = useState<BatchRow | null>(null);
  const [writingOff, setWritingOff] = useState<BatchRow | null>(null);
  const block = useBlockBatch();
  const columns: Column<BatchRow>[] = [
    { key: 'product', header: 'Product', cell: (b) => <div><Link href={`/products/${b.productId}`} className="font-medium hover:underline">{b.productName}</Link><div className="text-[12px] text-fg-subtle">{b.packLabel}{b.supplierName ? ` · ${b.supplierName}` : ''}</div></div> },
    { key: 'batch', header: 'Batch', cell: (b) => <span className="font-mono">{b.batchNumber}</span> },
    { key: 'expiry', header: 'Expiry', cell: (b) => { const e = expiryLabel(b.expiryDate); return <Badge variant={e.tone === 'neutral' ? 'neutral' : e.tone}>{formatDate(b.expiryDate, { month: 'short', year: 'numeric' })}{e.tone !== 'neutral' ? ` · ${e.text}` : ''}</Badge>; } },
    { key: 'qty', header: 'Qty', numeric: true, cell: (b) => <span className="font-medium">{b.qtyBase}</span> },
    { key: 'mrp', header: `MRP`, numeric: true, cell: (b) => <span>{money(b.mrpMinor)}<span className="block text-[11px] text-fg-subtle">/{b.pricingUnit}</span></span> },
    { key: 'sp', header: 'Selling', numeric: true, cell: (b) => money(b.sellingPriceMinor) },
    ...(canCost ? [{ key: 'cost', header: 'Cost', numeric: true, cell: (b: BatchRow) => b.purchasePriceMinor !== undefined ? money(b.purchasePriceMinor) : '—' }] : []),
    { key: 'status', header: 'Status', cell: (b) => b.status === 'blocked' ? <Badge variant="danger" dot>Blocked</Badge> : b.isExpired ? <Badge variant="danger" dot>Expired</Badge> : <Badge variant="success" dot>Sellable</Badge> },
    { key: 'actions', header: '', cell: (b) => (canEdit || canWriteOff) ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Batch actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit ? <DropdownMenuItem onSelect={() => setEditing(b)}><Pencil className="h-3.5 w-3.5" /> Edit expiry / prices</DropdownMenuItem> : null}
          {canEdit ? <DropdownMenuItem onSelect={() => block.mutate({ id: b.batchId, blocked: b.status !== 'blocked', reason: b.status !== 'blocked' ? 'Blocked from sale' : '' }, { onSuccess: () => toast.success(b.status !== 'blocked' ? 'Batch blocked' : 'Batch unblocked'), onError: (e) => toast.error(errorMessage(e)) })}><Ban className="h-3.5 w-3.5" /> {b.status === 'blocked' ? 'Unblock' : 'Block from sale'}</DropdownMenuItem> : null}
          {canWriteOff && b.qtyBase > 0 ? <DropdownMenuItem destructive onSelect={() => setWritingOff(b)}><Trash2 className="h-3.5 w-3.5" /> Write off</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="min-w-[260px] flex-1"><ProductPicker value={productId} onChange={(id) => { setProductId(id); setPage(1); }} placeholder="Filter by product…" /></div>
        <Input className="h-9 w-40" placeholder="Batch number" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Batch number" />
        <Select className="h-9 w-36" value={filters.expiryStatus} onChange={(e) => setFilter('expiryStatus', e.target.value)} aria-label="Expiry status"><option value="all">All batches</option><option value="expiring">Expiring soon</option><option value="expired">Expired</option><option value="safe">Safe</option></Select>
        <label className="flex items-center gap-2 text-[13px] text-fg-muted"><Checkbox checked={filters.includeZero === '1'} onChange={(e) => setFilter('includeZero', e.target.checked ? '1' : '')} /> Include empty</label>
      </div>
      <DataTable columns={columns} rows={batches.data?.items} rowKey={(b) => b.batchId} isPending={batches.isPending} isError={batches.isError} error={batches.error} meta={batches.data?.meta} onPageChange={setPage} empty={{ icon: Boxes, title: 'No batches match' }} />
      <EditBatchDialog batch={editing} onClose={() => setEditing(null)} />
      <WriteOffDialog batch={writingOff} onClose={() => setWritingOff(null)} />
    </Card>
  );
}

function EditBatchDialog({ batch, onClose }: { batch: BatchRow | null; onClose: () => void }) {
  const update = useUpdateBatch();
  const [expiry, setExpiry] = useState('');
  const [mfg, setMfg] = useState('');
  const [mrp, setMrp] = useState<number | null>(null);
  const [sp, setSp] = useState<number | null>(null);
  const open = !!batch;
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (batch && loadedFor !== batch.batchId) { setLoadedFor(batch.batchId); setExpiry(dateInput(batch.expiryDate)); setMfg(batch.mfgDate ? dateInput(batch.mfgDate) : ''); setMrp(batch.mrpMinor); setSp(batch.sellingPriceMinor); }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Edit batch ${batch?.batchNumber ?? ''}`} description={batch?.productName} size="sm">
        <div className="space-y-4">
          <FormField info="The expiry printed on the pack. Expired stock is blocked from sale automatically, and near-expiry stock appears in your alerts." label="Expiry date" htmlFor="b-exp" required><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></FormField>
          <FormField info="The manufacturing date on the pack, if you want to record it. Optional." label="Manufacturing date" htmlFor="b-mfg"><Input type="date" value={mfg} onChange={(e) => setMfg(e.target.value)} /></FormField>
          <FormGrid>
            <FormField info="The MRP printed on this particular batch. Older batches often carry a different MRP, which is why it is kept per batch." label="MRP" htmlFor="b-mrp"><MoneyInput value={mrp} onChange={setMrp} /></FormField>
            <FormField info="What you charge for this batch if it differs from the MRP. Leave blank to sell at the batch MRP." label="Selling price" htmlFor="b-sp"><MoneyInput value={sp} onChange={setSp} /></FormField>
          </FormGrid>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={update.isPending} onClick={() => batch && update.mutate({ id: batch.batchId, input: { expiryDate: expiry || undefined, mfgDate: mfg || null, mrpMinor: mrp ?? undefined, sellingPriceMinor: sp ?? undefined } }, { onSuccess: () => { toast.success('Batch updated'); onClose(); }, onError: (e) => toast.error(errorMessage(e)) })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WriteOffDialog({ batch, onClose }: { batch: BatchRow | null; onClose: () => void }) {
  const writeOff = useWriteOff();
  const [qty, setQty] = useState<number | null>(null);
  const [kind, setKind] = useState<'expiry' | 'damage'>('expiry');
  const [note, setNote] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (batch && loadedFor !== batch.batchId) { setLoadedFor(batch.batchId); setQty(batch.qtyBase); setKind(batch.isExpired ? 'expiry' : 'damage'); setNote(''); setKey(newIdempotencyKey()); }
  return (
    <Dialog open={!!batch} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Write off ${batch?.batchNumber ?? ''}`} description={`${batch?.productName ?? ''} · ${batch?.qtyBase ?? 0} on hand. Creates an approved adjustment and a stock movement.`} size="sm">
        <div className="space-y-4">
          <FormField info="How many base units you are entering, for example tablets rather than strips. Check the base unit on the product before typing a number." label="Quantity (base units)" htmlFor="wo-qty" required><Input type="number" min={1} max={batch?.qtyBase} value={qty ?? ''} onChange={(e) => setQty(e.target.value === '' ? null : Math.min(Number(e.target.value), batch?.qtyBase ?? 0))} /></FormField>
          <FormField info="Why stock is changing. It is recorded in the audit trail, which matters when you reconcile a physical count later." label="Reason" htmlFor="wo-kind"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="expiry">Expired</option><option value="damage">Damaged</option></Select></FormField>
          <FormField info="Extra detail for this entry, for example which shelf was counted." label="Note" htmlFor="wo-note"><Textarea className="min-h-[38px]" value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={writeOff.isPending} disabled={!qty} onClick={() => batch && writeOff.mutate({ idempotencyKey: key, input: { batchId: batch.batchId, qtyBase: qty!, kind, note } }, { onSuccess: (a) => { toast.success(`Written off · ${a.number}`); onClose(); }, onError: (e) => toast.error(errorMessage(e)) })}>Write off</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpiryTab() {
  const summary = useExpirySummary();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [within, setWithin] = useState(90);
  const batches = useBatches({ page, expiryStatus: 'expiring', withinDays: within });
  const canValuation = usePermission('inventory.viewValuation');
  const s = summary.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Expired" value={s ? s.expired.batches : <Skeleton className="h-7 w-10" />} hint={s ? `${s.expired.qtyBase} units${s.expired.valueMinor !== undefined && canValuation ? ` · ${moneyCompact(s.expired.valueMinor)}` : ''}` : ''} className="border-danger-600/30" />
        {(s?.buckets ?? []).map((b) => <Stat key={b.days} label={`≤ ${b.days} days`} value={b.batches} hint={`${b.qtyBase} units${b.valueMinor !== undefined && canValuation ? ` · ${moneyCompact(b.valueMinor)}` : ''}`} />)}
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <span className="text-[13px] text-fg-muted">Batches expiring within</span>
          <Select className="h-9 w-32" value={within} onChange={(e) => { setWithin(Number(e.target.value)); setPage(1); }} aria-label="Within days"><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>1 year</option></Select>
          <Link href="/inventory?tab=batches" className="ml-auto text-[13px] font-medium text-primary-700 hover:underline">Manage batches</Link>
        </div>
        <DataTable
          columns={[
            { key: 'product', header: 'Product', cell: (b: BatchRow) => <div><div className="font-medium">{b.productName}</div><div className="text-[12px] text-fg-subtle">{b.packLabel}</div></div> },
            { key: 'batch', header: 'Batch', cell: (b: BatchRow) => <span className="font-mono">{b.batchNumber}</span> },
            { key: 'expiry', header: 'Expiry', cell: (b: BatchRow) => { const e = expiryLabel(b.expiryDate); return <Badge variant={e.tone === 'neutral' ? 'neutral' : e.tone}>{formatDate(b.expiryDate)} · {e.text}</Badge>; } },
            { key: 'qty', header: 'Qty', numeric: true, cell: (b: BatchRow) => b.qtyBase },
            { key: 'val', header: 'Value at MRP', numeric: true, cell: (b: BatchRow) => money(Math.round((b.qtyBase * b.mrpMinor) / b.pricingUnitFactor)) },
            { key: 'supplier', header: 'Supplier', cell: (b: BatchRow) => b.supplierName ?? '—' },
          ]}
          rows={batches.data?.items} rowKey={(b) => b.batchId} isPending={batches.isPending} isError={batches.isError} error={batches.error} meta={batches.data?.meta} onPageChange={setPage} onRowClick={(b) => router.push(`/products/${b.productId}`)} empty={{ icon: CalendarClock, title: 'Nothing expiring in this window' }} />
      </Card>
    </div>
  );
}

function LowStockTab() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 250);
  const low = useLowStock(page, dq || undefined);
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-3"><div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-faint" /><Input className="h-9 pl-8" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search low stock" /></div><Link href="/reports/inventory.lowStock" className="text-[13px] font-medium text-primary-700 hover:underline">Export report</Link></div>
      <DataTable
        columns={[
          { key: 'product', header: 'Product', cell: (r: StockOverviewRow) => <div><div className="font-medium">{r.name}</div><div className="text-[12px] text-fg-subtle">{[r.packLabel, r.manufacturer].filter(Boolean).join(' · ')}</div></div> },
          { key: 'sellable', header: 'Sellable', numeric: true, cell: (r: StockOverviewRow) => <span className="font-medium text-danger-600">{r.sellableBase} {r.baseUnit}</span> },
          { key: 'reorder', header: 'Reorder level', numeric: true, cell: (r: StockOverviewRow) => r.reorderLevelBase },
          { key: 'min', header: 'Minimum', numeric: true, cell: (r: StockOverviewRow) => r.minStockBase || '—' },
          { key: 'transit', header: 'In transit', numeric: true, cell: (r: StockOverviewRow) => r.inTransitBase || '—' },
          { key: 'short', header: 'Shortfall', numeric: true, cell: (r: StockOverviewRow) => Math.max(r.reorderLevelBase - r.sellableBase, 0) },
        ]}
        rows={low.data?.items} rowKey={(r) => r.productId} isPending={low.isPending} isError={low.isError} error={low.error} meta={low.data?.meta} onPageChange={setPage} onRowClick={(r) => router.push(`/products/${r.productId}`)} empty={{ icon: PackageSearch, title: 'No products below reorder level', description: 'Set reorder levels on products to get alerts here.' }} />
    </Card>
  );
}

const MOVEMENT_REASONS = ['opening_stock', 'purchase', 'sale', 'sales_return', 'purchase_return', 'adjustment', 'transfer_out', 'transfer_in', 'write_off', 'sale_cancelled', 'purchase_cancelled'];

function MovementsTab() {
  const { page, setPage, filters, setFilter } = useListState({ reason: '' });
  const [productId, setProductId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(defaultRange(30));
  const moves = useMovements({ page, productId: productId ?? undefined, reason: filters.reason || undefined, ...rangeToQuery(range) });
  const canExport = usePermission('data.export');
  const [exporting, setExporting] = useState(false);
  const columns: Column<MovementRow>[] = [
    { key: 'at', header: 'When', cell: (m) => formatDateTime(m.createdAt) },
    { key: 'product', header: 'Product', cell: (m) => <Link href={`/products/${m.productId}`} className="font-medium hover:underline">{m.productName}</Link> },
    { key: 'batch', header: 'Batch', cell: (m) => <span className="font-mono text-[12px]">{m.batchNumber}</span> },
    { key: 'reason', header: 'Reason', cell: (m) => <span className="capitalize">{m.reason.replace(/_/g, ' ')}</span> },
    { key: 'ref', header: 'Reference', cell: (m) => m.refNumber || '—' },
    { key: 'delta', header: 'Change', numeric: true, cell: (m) => <span className={m.qtyBaseDelta < 0 ? 'font-medium text-danger-600' : 'font-medium text-success-700'}>{m.qtyBaseDelta > 0 ? '+' : ''}{m.qtyBaseDelta}</span> },
    { key: 'bal', header: 'Balance', numeric: true, cell: (m) => m.balanceAfterBase },
    { key: 'user', header: 'By', cell: (m) => m.user?.name ?? 'System' },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="min-w-[240px] flex-1"><ProductPicker value={productId} onChange={(id) => { setProductId(id); setPage(1); }} placeholder="Filter by product…" /></div>
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="h-9 w-40" value={filters.reason} onChange={(e) => setFilter('reason', e.target.value)} aria-label="Reason"><option value="">Any reason</option>{MOVEMENT_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</Select>
        {canExport ? <Button variant="secondary" size="sm" loading={exporting} onClick={async () => { setExporting(true); try { const r = rangeToQuery(range); await downloadFile(`/exports/movements?format=xlsx&from=${r.from}&to=${r.to}`, 'movements.xlsx'); } catch (e) { toast.error(errorMessage(e)); } finally { setExporting(false); } }}><Download className="h-3.5 w-3.5" /> Export</Button> : null}
      </div>
      <DataTable columns={columns} rows={moves.data?.items} rowKey={(m) => m.id} isPending={moves.isPending} isError={moves.isError} error={moves.error} meta={moves.data?.meta} onPageChange={setPage} dense empty={{ title: 'No movements in this period' }} />
    </Card>
  );
}

function AdjustmentsTab() {
  const router = useRouter();
  const { page, setPage, filters, setFilter } = useListState({ status: '', type: '' });
  const adjustments = useAdjustments({ page, status: filters.status || undefined, type: filters.type || undefined });
  const canAdjust = usePermission('inventory.adjust');
  const columns: Column<AdjustmentDto>[] = [
    { key: 'number', header: 'Adjustment', cell: (a) => <div><div className="font-medium">{a.number}</div><div className="text-[12px] text-fg-subtle">{formatDateTime(a.createdAt)}</div></div> },
    { key: 'type', header: 'Type', cell: (a) => <span className="capitalize">{a.type}</span> },
    { key: 'reason', header: 'Reason', cell: (a) => <span className="capitalize">{a.reason.replace(/_/g, ' ')}</span> },
    { key: 'lines', header: 'Lines', numeric: true, cell: (a) => a.lines.length },
    { key: 'value', header: 'Value', numeric: true, cell: (a) => money(a.totalValueMinor) },
    { key: 'status', header: 'Status', cell: (a) => <DocStatusBadge status={a.status} /> },
    { key: 'by', header: 'Requested by', cell: (a) => a.requestedBy?.name ?? '—' },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Select className="h-9 w-44" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status"><option value="">Any status</option><option value="pending_approval">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select>
        <Select className="h-9 w-40" value={filters.type} onChange={(e) => setFilter('type', e.target.value)} aria-label="Type"><option value="">Any type</option>{['increase', 'decrease', 'damage', 'expiry', 'lost', 'reconciliation'].map((t) => <option key={t} value={t}>{t}</option>)}</Select>
        {canAdjust ? <Link href="/inventory/adjustments/new" className={`ml-auto ${buttonVariants({ size: 'sm' })}`}><Plus className="h-4 w-4" /> New adjustment</Link> : null}
      </div>
      <DataTable columns={columns} rows={adjustments.data?.items} rowKey={(a) => a.id} isPending={adjustments.isPending} isError={adjustments.isError} error={adjustments.error} meta={adjustments.data?.meta} onPageChange={setPage} onRowClick={(a) => router.push(`/inventory/adjustments/${a.id}`)} empty={{ icon: ClipboardEdit, title: 'No adjustments', description: 'Record physical count differences, damage or losses.' }} />
    </Card>
  );
}

function TransfersTab() {
  const router = useRouter();
  const { page, setPage, filters, setFilter } = useListState({ status: '', direction: 'all' });
  const transfers = useTransfers({ page, status: filters.status || undefined, direction: (filters.direction as 'in' | 'out' | 'all') || 'all' });
  const canCreate = usePermission('inventory.transfer.create');
  const outletId = useSession((s) => s.activeOutletId);
  const columns: Column<TransferDto>[] = [
    { key: 'number', header: 'Transfer', cell: (t) => <div><div className="font-medium">{t.number}</div><div className="text-[12px] text-fg-subtle">{formatDateTime(t.requestedAt)}</div></div> },
    { key: 'dir', header: 'Direction', cell: (t) => t.fromOutletId === outletId ? <Badge variant="warning">Out → {t.toOutletName}</Badge> : <Badge variant="info">In ← {t.fromOutletName}</Badge> },
    { key: 'lines', header: 'Lines', numeric: true, cell: (t) => t.lines.length },
    { key: 'qty', header: 'Requested', numeric: true, cell: (t) => t.lines.reduce((s, l) => s + l.qtyRequestedBase, 0) },
    { key: 'status', header: 'Status', cell: (t) => <DocStatusBadge status={t.status} /> },
    { key: 'by', header: 'Requested by', cell: (t) => t.requestedBy?.name ?? '—' },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Select className="h-9 w-36" value={filters.direction} onChange={(e) => setFilter('direction', e.target.value)} aria-label="Direction"><option value="all">In and out</option><option value="in">Incoming</option><option value="out">Outgoing</option></Select>
        <Select className="h-9 w-44" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status"><option value="">Any status</option>{['requested', 'approved', 'dispatched', 'received', 'partially_received', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</Select>
        {canCreate ? <Link href="/inventory/transfers/new" className={`ml-auto ${buttonVariants({ size: 'sm' })}`}><Plus className="h-4 w-4" /> New transfer</Link> : null}
      </div>
      <DataTable columns={columns} rows={transfers.data?.items} rowKey={(t) => t.id} isPending={transfers.isPending} isError={transfers.isError} error={transfers.error} meta={transfers.data?.meta} onPageChange={setPage} onRowClick={(t) => router.push(`/inventory/transfers/${t.id}`)} empty={{ icon: ArrowLeftRight, title: 'No transfers', description: 'Move stock between outlets with approval, dispatch and receipt steps.' }} />
    </Card>
  );
}
