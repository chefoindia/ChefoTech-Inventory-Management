'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pill, Upload, Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductDto } from '@pharmaos/shared';
import { useProducts, useCategories } from '@/features/catalog/api';
import { usePermission } from '@/features/auth/permissions';
import { useDebounce } from '@/hooks/use-debounce';
import { downloadFile } from '@/features/reports/api';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { DataTable, useListState, type Column } from '@/components/ui/data-table';

export default function ProductsPage() {
  const router = useRouter();
  const { page, setPage, filters, setFilter } = useListState({ q: '', categoryId: '', status: 'active', schedule: '' });
  const q = useDebounce(filters.q ?? '', 250);
  const products = useProducts({ page, q: q || undefined, categoryId: filters.categoryId || undefined, status: filters.status || undefined, schedule: filters.schedule || undefined });
  const categories = useCategories();
  const canCreate = usePermission('products.create');
  const canImport = usePermission('products.import');
  const canExport = usePermission('products.export');
  const canStock = usePermission('inventory.view');
  const [exporting, setExporting] = useState(false);

  const columns: Column<ProductDto>[] = [
    { key: 'name', header: 'Product', cell: (p) => (
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium"><span className="truncate">{p.name}</span>{p.requiresPrescription ? <Badge variant="warning">Rx</Badge> : null}{p.schedule !== 'none' ? <Badge variant="neutral">{p.schedule}</Badge> : null}</div>
        <div className="truncate text-[12px] text-fg-subtle">{[p.genericName || p.composition, p.manufacturer, p.packLabel].filter(Boolean).join(' · ')}</div>
      </div>
    ) },
    { key: 'category', header: 'Category', cell: (p) => p.categoryName ?? <span className="text-fg-faint">—</span> },
    { key: 'mrp', header: 'MRP', numeric: true, cell: (p) => money(p.pricing.mrpMinor) },
    { key: 'price', header: 'Selling', numeric: true, cell: (p) => money(p.pricing.sellingPriceMinor || p.pricing.mrpMinor) },
    { key: 'gst', header: 'GST', numeric: true, cell: (p) => `${p.tax.rateBps / 100}%` },
    ...(canStock ? [{ key: 'stock', header: 'Stock', numeric: true, cell: (p: ProductDto) => p.stockBase !== undefined ? <span className={p.stockBase <= p.stockRules.reorderLevelBase && p.stockRules.reorderLevelBase > 0 ? 'font-medium text-danger-600' : ''}>{p.stockBase}</span> : '—' }] : []),
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description={products.data ? `${products.data.meta.total} products` : 'Catalogue of medicines and items you sell.'}
        actions={
          <>
            {canExport ? <Button variant="secondary" size="sm" loading={exporting} onClick={async () => { setExporting(true); try { await downloadFile('/exports/products?format=xlsx', 'products.xlsx'); } catch (err) { toast.error(errorMessage(err)); } finally { setExporting(false); } }}><Download className="h-3.5 w-3.5" /> Export</Button> : null}
            {canImport ? <Link href="/settings/data?entity=products" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Upload className="h-3.5 w-3.5" /> Import</Link> : null}
            {canCreate ? <Link href="/products/new" className={buttonVariants({ size: 'sm' })}><Plus className="h-4 w-4" /> New product</Link> : null}
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-faint" />
            <Input className="h-9 pl-8" placeholder="Search name, generic, composition, barcode…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search products" />
          </div>
          <Select className="h-9 w-44" value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.path || c.name}</option>)}
          </Select>
          <Select className="h-9 w-36" value={filters.schedule} onChange={(e) => setFilter('schedule', e.target.value)} aria-label="Schedule">
            <option value="">Any schedule</option>
            {['OTC', 'G', 'H', 'H1', 'X', 'narcotic'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select className="h-9 w-32" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
            <option value="">All</option>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={products.data?.items}
          rowKey={(p) => p.id}
          isPending={products.isPending}
          isError={products.isError}
          error={products.error}
          onRetry={() => products.refetch()}
          meta={products.data?.meta}
          onPageChange={setPage}
          onRowClick={(p) => router.push(`/products/${p.id}`)}
          empty={{ icon: Pill, title: q ? 'No products match' : 'No products yet', description: q ? 'Try a different name or barcode.' : 'Add products one by one or import a CSV from your old software.', action: canCreate && !q ? <Link href="/products/new" className={buttonVariants({ size: 'sm' })}><Plus className="h-4 w-4" /> New product</Link> : undefined }}
        />
      </Card>
    </>
  );
}
