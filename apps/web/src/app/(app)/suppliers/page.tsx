'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Building2, Search, Download, Upload } from 'lucide-react';
import type { SupplierDto } from '@pharmaos/shared';
import { useSuppliers } from '@/features/parties/api';
import { SupplierDialog } from '@/features/parties/party-forms';
import { usePermission } from '@/features/auth/permissions';
import { useDebounce } from '@/hooks/use-debounce';
import { downloadFile } from '@/features/reports/api';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select, Checkbox } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { DataTable, useListState, type Column } from '@/components/ui/data-table';

export default function SuppliersPage() {
  return <Suspense><SuppliersInner /></Suspense>;
}

function SuppliersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, setPage, filters, setFilter } = useListState({ q: '', status: 'active', hasBalance: params.get('hasBalance') === 'true' ? '1' : '' });
  const q = useDebounce(filters.q ?? '', 250);
  const suppliers = useSuppliers({ page, q: q || undefined, status: filters.status || undefined, hasBalance: filters.hasBalance === '1' ? true : undefined });
  const canManage = usePermission('suppliers.manage');
  const canExport = usePermission('suppliers.export');
  const canImport = usePermission('data.import');
  const canLedger = usePermission('suppliers.viewLedger');
  const [dialogOpen, setDialogOpen] = useState(params.get('new') === '1');
  const [exporting, setExporting] = useState(false);
  const columns: Column<SupplierDto>[] = [
    { key: 'name', header: 'Supplier', cell: (s) => <div><div className="font-medium">{s.name}{s.code ? <span className="ml-2 text-[12px] text-fg-subtle">{s.code}</span> : null}</div><div className="text-[12px] text-fg-subtle">{[s.contactPerson, s.phone, s.email].filter(Boolean).join(' · ')}</div></div> },
    { key: 'gstin', header: 'GSTIN', cell: (s) => s.gstin ? <span className="font-mono text-[12px]">{s.gstin}</span> : '—' },
    { key: 'state', header: 'State', cell: (s) => s.stateCode || '—' },
    { key: 'terms', header: 'Terms', cell: (s) => `${s.paymentTermsDays} days` },
    ...(canLedger ? [{ key: 'balance', header: 'Payable', numeric: true, cell: (s: SupplierDto) => s.balanceMinor ? <span className={s.balanceMinor > 0 ? 'font-medium text-danger-600' : 'font-medium text-success-700'}>{money(s.balanceMinor)}</span> : '—' }] : []),
    { key: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
  ];
  return (
    <>
      <PageHeader title="Suppliers" description={suppliers.data ? `${suppliers.data.meta.total} suppliers` : 'Distributors and wholesalers you buy from.'} actions={<>
        {canExport ? <Button variant="secondary" size="sm" loading={exporting} onClick={async () => { setExporting(true); try { await downloadFile('/exports/suppliers?format=xlsx', 'suppliers.xlsx'); } catch (e) { toast.error(errorMessage(e)); } finally { setExporting(false); } }}><Download className="h-3.5 w-3.5" /> Export</Button> : null}
        {canImport ? <Link href="/settings/data?entity=suppliers" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Upload className="h-3.5 w-3.5" /> Import</Link> : null}
        {canManage ? <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New supplier</Button> : null}
      </>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-faint" /><Input className="h-9 pl-8" placeholder="Name, GSTIN, phone…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search suppliers" /></div>
          <Select className="h-9 w-32" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status"><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option><option value="">All</option></Select>
          {canLedger ? <label className="flex items-center gap-2 text-[13px] text-fg-muted"><Checkbox checked={filters.hasBalance === '1'} onChange={(e) => setFilter('hasBalance', e.target.checked ? '1' : '')} /> With payable balance</label> : null}
        </div>
        <DataTable columns={columns} rows={suppliers.data?.items} rowKey={(s) => s.id} isPending={suppliers.isPending} isError={suppliers.isError} error={suppliers.error} onRetry={() => suppliers.refetch()} meta={suppliers.data?.meta} onPageChange={setPage} onRowClick={(s) => router.push(`/suppliers/${s.id}`)} empty={{ icon: Building2, title: q ? 'No suppliers match' : 'No suppliers yet', description: 'Add your distributors before recording purchases.', action: canManage && !q ? <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New supplier</Button> : undefined }} />
      </Card>
      <SupplierDialog open={dialogOpen} onOpenChange={setDialogOpen} supplier={null} onSaved={(s) => router.push(`/suppliers/${s.id}`)} />
    </>
  );
}
