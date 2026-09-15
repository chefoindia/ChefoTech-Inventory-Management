'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Users, Search, Download, Upload } from 'lucide-react';
import Link from 'next/link';
import type { CustomerDto } from '@pharmaos/shared';
import { useCustomers } from '@/features/parties/api';
import { CustomerDialog } from '@/features/parties/party-forms';
import { usePermission } from '@/features/auth/permissions';
import { useDebounce } from '@/hooks/use-debounce';
import { downloadFile } from '@/features/reports/api';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select, Checkbox } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { DataTable, useListState, type Column } from '@/components/ui/data-table';

export default function CustomersPage() {
  return <Suspense><CustomersInner /></Suspense>;
}

function CustomersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, setPage, filters, setFilter } = useListState({ q: '', status: 'active', hasBalance: params.get('hasBalance') === 'true' ? '1' : '' });
  const q = useDebounce(filters.q ?? '', 250);
  const customers = useCustomers({ page, q: q || undefined, status: filters.status || undefined, hasBalance: filters.hasBalance === '1' ? true : undefined, sort: filters.hasBalance === '1' ? '-balanceMinor' : undefined });
  const canManage = usePermission('customers.manage');
  const canExport = usePermission('customers.export');
  const canImport = usePermission('data.import');
  const canLedger = usePermission('customers.viewLedger');
  const [dialogOpen, setDialogOpen] = useState(params.get('new') === '1');
  const [exporting, setExporting] = useState(false);
  useEffect(() => { if (params.get('new') === '1') setDialogOpen(true); }, [params]);

  const columns: Column<CustomerDto>[] = [
    { key: 'name', header: 'Customer', cell: (c) => <div><div className="font-medium">{c.name}</div><div className="text-[12px] text-fg-subtle">{[c.phone, c.email].filter(Boolean).join(' · ')}</div></div> },
    { key: 'city', header: 'City', cell: (c) => c.address?.city || '—' },
    { key: 'tags', header: 'Tags', cell: (c) => c.tags.length ? <span className="flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}</span> : '—' },
    ...(canLedger ? [{ key: 'balance', header: 'Balance', numeric: true, cell: (c: CustomerDto) => c.balanceMinor ? <span className={c.balanceMinor > 0 ? 'font-medium text-danger-600' : 'font-medium text-success-700'}>{money(c.balanceMinor)}</span> : '—' }, { key: 'limit', header: 'Credit limit', numeric: true, cell: (c: CustomerDto) => c.creditLimitMinor ? money(c.creditLimitMinor) : '—' }] : []),
    { key: 'last', header: 'Last purchase', cell: (c) => c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : '—' },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <>
      <PageHeader title="Customers" description={customers.data ? `${customers.data.meta.total} customers` : 'Patients and buyers, with credit and purchase history.'} actions={<>
        {canExport ? <Button variant="secondary" size="sm" loading={exporting} onClick={async () => { setExporting(true); try { await downloadFile('/exports/customers?format=xlsx', 'customers.xlsx'); } catch (e) { toast.error(errorMessage(e)); } finally { setExporting(false); } }}><Download className="h-3.5 w-3.5" /> Export</Button> : null}
        {canImport ? <Link href="/settings/data?entity=customers" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Upload className="h-3.5 w-3.5" /> Import</Link> : null}
        {canManage ? <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New customer</Button> : null}
      </>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-faint" /><Input className="h-9 pl-8" placeholder="Name, phone, email…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search customers" /></div>
          <Select className="h-9 w-32" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status"><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option><option value="">All</option></Select>
          {canLedger ? <label className="flex items-center gap-2 text-[13px] text-fg-muted"><Checkbox checked={filters.hasBalance === '1'} onChange={(e) => setFilter('hasBalance', e.target.checked ? '1' : '')} /> With outstanding balance</label> : null}
        </div>
        <DataTable columns={columns} rows={customers.data?.items} rowKey={(c) => c.id} isPending={customers.isPending} isError={customers.isError} error={customers.error} onRetry={() => customers.refetch()} meta={customers.data?.meta} onPageChange={setPage} onRowClick={(c) => router.push(`/customers/${c.id}`)} empty={{ icon: Users, title: q ? 'No customers match' : 'No customers yet', description: 'Customers are also created on the fly at the POS.', action: canManage && !q ? <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New customer</Button> : undefined }} />
      </Card>
      <CustomerDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o && params.get('new')) router.replace('/customers'); }} customer={null} onSaved={(c) => router.push(`/customers/${c.id}`)} />
    </>
  );
}
