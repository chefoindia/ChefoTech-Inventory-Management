'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Archive, Barcode, Printer, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { BatchRow } from '@pharmaos/shared';
import { useProduct, useArchiveProduct, useGenerateBarcode, useProductAttachment } from '@/features/catalog/api';
import { useBatches, useMovements } from '@/features/inventory/api';
import { openDocument } from '@/features/documents/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { money, baseToDisplay, expiryLabel } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/states';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FileUpload, AttachmentList } from '@/components/ui/file-upload';
import { CustomFieldsView } from '@/components/ui/custom-fields-form';
import { Select } from '@/components/ui/input';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const product = useProduct(id);
  const archive = useArchiveProduct();
  const genBarcode = useGenerateBarcode();
  const attach = useProductAttachment();
  const canEdit = usePermission('products.edit');
  const canArchive = usePermission('products.archive');
  const canBarcode = usePermission('products.manageBarcodes');
  const canStock = usePermission('inventory.view');
  const canCost = usePermission('products.viewCost');
  const [archiving, setArchiving] = useState(false);
  const [labelUnit, setLabelUnit] = useState('');

  if (product.isPending) return <Spinner />;
  if (product.isError) return <ErrorState message={errorMessage(product.error)} onRetry={() => product.refetch()} />;
  const p = product.data;
  const base = p.units.find((u) => u.unitId === p.baseUnitId);
  const pricingUnit = p.units.find((u) => u.unitId === p.pricingUnitId);

  return (
    <>
      <PageHeader
        title={p.name}
        description={<span className="flex flex-wrap items-center gap-2">{[p.genericName || p.composition, p.manufacturer, p.packLabel].filter(Boolean).join(' · ')} <StatusBadge status={p.status} />{p.requiresPrescription ? <Badge variant="warning">Prescription required</Badge> : null}{p.schedule !== 'none' ? <Badge>Schedule {p.schedule}</Badge> : null}</span>}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => openDocument('barcodeLabel', p.id, { print: true }).catch((e) => toast.error(errorMessage(e)))}><Printer className="h-3.5 w-3.5" /> Print label</Button>
            {canEdit ? <Link href={`/products/${p.id}/edit`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Pencil className="h-3.5 w-3.5" /> Edit</Link> : null}
            {canArchive && p.status !== 'archived' ? <Button variant="ghost" size="sm" onClick={() => setArchiving(true)}><Archive className="h-3.5 w-3.5" /> Archive</Button> : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="px-5 py-4"><div className="text-[12px] font-medium uppercase tracking-wide text-fg-subtle">MRP</div><div className="mt-1 text-2xl font-semibold tabular">{money(p.pricing.mrpMinor)}</div><div className="text-[12px] text-fg-subtle">per {pricingUnit?.unitName ?? 'unit'}</div></Card>
        <Card className="px-5 py-4"><div className="text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Selling price</div><div className="mt-1 text-2xl font-semibold tabular">{money(p.pricing.sellingPriceMinor || p.pricing.mrpMinor)}</div><div className="text-[12px] text-fg-subtle">GST {p.tax.rateBps / 100}%{p.tax.cessBps ? ` + cess ${p.tax.cessBps / 100}%` : ''} · HSN {p.hsnCode || '—'}</div></Card>
        {canCost ? <Card className="px-5 py-4"><div className="text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Purchase price</div><div className="mt-1 text-2xl font-semibold tabular">{money(p.pricing.purchasePriceMinor ?? 0)}</div><div className="text-[12px] text-fg-subtle">Default for new purchases</div></Card> : null}
        {canStock ? <Card className="px-5 py-4"><div className="text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Stock at outlet</div><div className="mt-1 text-2xl font-semibold tabular">{p.stockBase ?? 0} <span className="text-sm font-normal text-fg-subtle">{base?.abbreviation}</span></div><div className="text-[12px] text-fg-subtle">{pricingUnit && base ? baseToDisplay(p.stockBase ?? 0, pricingUnit.factorToBase, pricingUnit.unitName, base.unitName) : ''}{p.stockRules.reorderLevelBase ? ` · reorder at ${p.stockRules.reorderLevelBase}` : ''}</div></Card> : null}
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canStock ? <TabsTrigger value="batches">Batches</TabsTrigger> : null}
          {canStock ? <TabsTrigger value="movements">Movements</TabsTrigger> : null}
          <TabsTrigger value="files">Images & files</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Details</CardTitle></CardHeader>
              <CardContent>
                <KeyValue items={[
                  { label: 'Brand', value: p.brandName || '—' },
                  { label: 'Generic name', value: p.genericName || '—' },
                  { label: 'Composition', value: p.composition || '—' },
                  { label: 'Manufacturer', value: p.manufacturer || '—' },
                  { label: 'Category', value: p.categoryName ?? 'Uncategorised' },
                  { label: 'Dosage form', value: `${p.dosageForm}${p.strength ? ` · ${p.strength}` : ''}` },
                  { label: 'Rack', value: p.rackLocation || '—' },
                  { label: 'Tags', value: p.tags.length ? p.tags.join(', ') : '—' },
                  { label: 'Notes', value: p.notes || '—' },
                  { label: 'Updated', value: formatDateTime(p.updatedAt) },
                ]} />
                <div className="mt-4"><CustomFieldsView entity="product" values={p.customFields} /></div>
              </CardContent>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader><CardTitle>Units</CardTitle></CardHeader>
                <ul className="divide-y divide-border">
                  {p.units.map((u) => (
                    <li key={u.unitId} className="flex items-center justify-between px-5 py-2 text-sm">
                      <span>{u.unitName} <span className="text-fg-subtle">({u.abbreviation})</span>{u.unitId === p.baseUnitId ? <Badge className="ml-2" variant="primary">Base</Badge> : null}{u.unitId === p.pricingUnitId ? <Badge className="ml-2">Pricing</Badge> : null}</span>
                      <span className="text-[12px] text-fg-subtle">{u.factorToBase > 1 ? `= ${u.factorToBase} ${base?.abbreviation}` : ''}{u.isDefaultSale ? ' · default sale' : ''}{u.isDefaultPurchase ? ' · default purchase' : ''}{!u.allowLooseSale ? ' · no loose sale' : ''}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Barcodes</CardTitle>
                  {canBarcode ? (
                    <div className="flex items-center gap-2">
                      <Select className="h-8 w-36" value={labelUnit} onChange={(e) => setLabelUnit(e.target.value)} aria-label="Unit for generated barcode">
                        <option value="">Any unit</option>
                        {p.units.map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}
                      </Select>
                      <Button variant="secondary" size="sm" loading={genBarcode.isPending} onClick={() => genBarcode.mutate({ id: p.id, unitId: labelUnit || undefined }, { onSuccess: () => toast.success('Internal barcode generated'), onError: (e) => toast.error(errorMessage(e)) })}><Barcode className="h-3.5 w-3.5" /> Generate</Button>
                    </div>
                  ) : null}
                </CardHeader>
                {p.barcodes.length === 0 ? <EmptyState icon={Barcode} title="No barcodes" description="Add a manufacturer code or generate an internal one for labels." className="py-8" /> : (
                  <ul className="divide-y divide-border">
                    {p.barcodes.map((b) => (
                      <li key={b.code} className="flex items-center justify-between px-5 py-2 text-sm">
                        <code className="font-mono">{b.code}</code>
                        <span className="flex items-center gap-2 text-[12px] text-fg-subtle">{b.unitId ? p.units.find((u) => u.unitId === b.unitId)?.unitName : 'Any unit'}<Badge variant="neutral">{b.source}</Badge>{b.isPrimary ? <Badge variant="primary">Primary</Badge> : null}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>

        {canStock ? <TabsContent value="batches"><ProductBatches productId={p.id} pricingUnit={pricingUnit?.unitName ?? ''} baseUnit={base?.abbreviation ?? ''} /></TabsContent> : null}
        {canStock ? <TabsContent value="movements"><ProductMovements productId={p.id} /></TabsContent> : null}

        <TabsContent value="files">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>Images</CardTitle>{canEdit ? <FileUpload purpose="productImage" entityId={p.id} accept="image/*" multiple label="Upload image" onUploaded={(refs) => refs.forEach((r) => attach.add.mutate({ id: p.id, kind: 'images', attachment: r }))} /> : null}</CardHeader>
              <CardContent>
                {p.images.length === 0 ? <EmptyState icon={ImageIcon} title="No images" className="py-6" /> : <AttachmentList items={p.images} onRemove={canEdit ? (publicId) => attach.remove.mutate({ id: p.id, kind: 'images', publicId }) : undefined} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>Documents</CardTitle>{canEdit ? <FileUpload purpose="productDocument" entityId={p.id} multiple label="Upload file" onUploaded={(refs) => refs.forEach((r) => attach.add.mutate({ id: p.id, kind: 'documents', attachment: r }))} /> : null}</CardHeader>
              <CardContent>
                <AttachmentList items={p.documents} onRemove={canEdit ? (publicId) => attach.remove.mutate({ id: p.id, kind: 'documents', publicId }) : undefined} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog open={archiving} onOpenChange={setArchiving} title={`Archive ${p.name}?`} description="The product disappears from search and billing. Stock history and past invoices are kept." confirmLabel="Archive" destructive loading={archive.isPending} onConfirm={() => archive.mutate(p.id, { onSuccess: () => { toast.success('Product archived'); router.push('/products'); }, onError: (e) => toast.error(errorMessage(e)) })} />
    </>
  );
}

function ProductBatches({ productId, pricingUnit, baseUnit }: { productId: string; pricingUnit: string; baseUnit: string }) {
  const [page, setPage] = useState(1);
  const [includeZero, setIncludeZero] = useState(false);
  const batches = useBatches({ page, productId, includeZero });
  const columns: Column<BatchRow>[] = [
    { key: 'batch', header: 'Batch', cell: (b) => <span className="font-mono">{b.batchNumber}</span> },
    { key: 'expiry', header: 'Expiry', cell: (b) => { const e = expiryLabel(b.expiryDate); return <Badge variant={e.tone === 'danger' ? 'danger' : e.tone === 'warning' ? 'warning' : 'neutral'}>{formatDate(b.expiryDate, { month: 'short', year: 'numeric' })}{e.tone !== 'neutral' ? ` · ${e.text}` : ''}</Badge>; } },
    { key: 'qty', header: `Qty (${baseUnit})`, numeric: true, cell: (b) => b.qtyBase },
    { key: 'mrp', header: `MRP / ${pricingUnit}`, numeric: true, cell: (b) => money(b.mrpMinor) },
    { key: 'sp', header: 'Selling', numeric: true, cell: (b) => money(b.sellingPriceMinor) },
    { key: 'supplier', header: 'Supplier', cell: (b) => b.supplierName ?? '—' },
    { key: 'status', header: 'Status', cell: (b) => b.status === 'blocked' ? <Badge variant="danger">Blocked{b.blockReason ? ` · ${b.blockReason}` : ''}</Badge> : b.isExpired ? <Badge variant="danger">Expired</Badge> : <Badge variant="success">Sellable</Badge> },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border p-3">
        <label className="flex items-center gap-2 text-[13px] text-fg-muted"><input type="checkbox" className="h-4 w-4 accent-primary-600" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} /> Include empty batches</label>
        <Link href={`/inventory?tab=batches&productId=${productId}`} className="text-[13px] font-medium text-primary-700 hover:underline">Manage in inventory</Link>
      </div>
      <DataTable columns={columns} rows={batches.data?.items} rowKey={(b) => b.batchId} isPending={batches.isPending} isError={batches.isError} error={batches.error} meta={batches.data?.meta} onPageChange={setPage} empty={{ title: 'No batches at this outlet', description: 'Stock arrives through purchases, opening stock or transfers.' }} />
    </Card>
  );
}

function ProductMovements({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const moves = useMovements({ page, productId });
  return (
    <Card>
      <DataTable
        columns={[
          { key: 'at', header: 'When', cell: (m) => formatDateTime(m.createdAt) },
          { key: 'batch', header: 'Batch', cell: (m) => <span className="font-mono">{m.batchNumber}</span> },
          { key: 'reason', header: 'Reason', cell: (m) => <span className="capitalize">{m.reason.replace(/_/g, ' ')}</span> },
          { key: 'ref', header: 'Reference', cell: (m) => m.refNumber || '—' },
          { key: 'delta', header: 'Change', numeric: true, cell: (m) => <span className={m.qtyBaseDelta < 0 ? 'text-danger-600' : 'text-success-700'}>{m.qtyBaseDelta > 0 ? '+' : ''}{m.qtyBaseDelta}</span> },
          { key: 'bal', header: 'Balance', numeric: true, cell: (m) => m.balanceAfterBase },
          { key: 'user', header: 'By', cell: (m) => m.user?.name ?? 'System' },
        ]}
        rows={moves.data?.items}
        rowKey={(m) => m.id}
        isPending={moves.isPending}
        isError={moves.isError}
        error={moves.error}
        meta={moves.data?.meta}
        onPageChange={setPage}
        dense
        empty={{ title: 'No movements yet' }}
      />
    </Card>
  );
}
