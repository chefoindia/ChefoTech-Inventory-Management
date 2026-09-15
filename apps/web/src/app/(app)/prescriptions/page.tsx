'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, FileText, Search } from 'lucide-react';
import type { PrescriptionDto } from '@pharmaos/shared';
import { usePrescriptions } from '@/features/prescriptions/api';
import { PrescriptionDialog } from '@/features/prescriptions/prescription-dialog';
import { usePermission } from '@/features/auth/permissions';
import { useDebounce } from '@/hooks/use-debounce';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { DocStatusBadge } from '@/components/ui/badge';
import { DataTable, useListState, type Column } from '@/components/ui/data-table';
import { DateRangePicker, defaultRange, rangeToQuery, type DateRange } from '@/components/ui/date-range';

export default function PrescriptionsPage() {
  return <Suspense><PrescriptionsInner /></Suspense>;
}

function PrescriptionsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, setPage, filters, setFilter } = useListState({ q: '', status: '' });
  const [range, setRange] = useState<DateRange>(defaultRange(365));
  const q = useDebounce(filters.q ?? '', 250);
  const rx = usePrescriptions({ page, q: q || undefined, status: filters.status || undefined, ...rangeToQuery(range) });
  const canManage = usePermission('prescriptions.manage');
  const [dialogOpen, setDialogOpen] = useState(params.get('new') === '1');
  useEffect(() => { if (params.get('new') === '1') setDialogOpen(true); }, [params]);
  const columns: Column<PrescriptionDto>[] = [
    { key: 'customer', header: 'Customer', cell: (p) => <div><div className="font-medium">{p.customerName}</div><div className="text-[12px] text-fg-subtle">{p.customerPhone}</div></div> },
    { key: 'doctor', header: 'Doctor', cell: (p) => <div><div>Dr {p.doctorName}</div><div className="text-[12px] text-fg-subtle">{p.hospital || p.doctorRegNo || '—'}</div></div> },
    { key: 'date', header: 'Date', cell: (p) => formatDate(p.prescriptionDate) },
    { key: 'valid', header: 'Valid until', cell: (p) => p.validUntil ? formatDate(p.validUntil) : '—' },
    { key: 'items', header: 'Medicines', cell: (p) => <span className="line-clamp-1">{p.items.map((i) => i.medicine).join(', ') || `${p.files.length} file(s)`}</span> },
    { key: 'sales', header: 'Used in', cell: (p) => p.linkedSales.length ? `${p.linkedSales.length} invoice(s)` : '—' },
    { key: 'status', header: 'Status', cell: (p) => <DocStatusBadge status={p.status} /> },
  ];
  return (
    <>
      <PageHeader title="Prescriptions" description="Doctor prescriptions on file, linked to customers and schedule-H sales." actions={canManage ? <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New prescription</Button> : null} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-faint" /><Input className="h-9 pl-8" placeholder="Doctor, customer, medicine…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search prescriptions" /></div>
          <DateRangePicker value={range} onChange={setRange} />
          <Select className="h-9 w-32" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="used">Used</option><option value="expired">Expired</option><option value="archived">Archived</option></Select>
        </div>
        <DataTable columns={columns} rows={rx.data?.items} rowKey={(p) => p.id} isPending={rx.isPending} isError={rx.isError} error={rx.error} onRetry={() => rx.refetch()} meta={rx.data?.meta} onPageChange={setPage} onRowClick={(p) => router.push(`/prescriptions/${p.id}`)} empty={{ icon: FileText, title: 'No prescriptions', description: 'Attach prescriptions to customers to satisfy schedule H/H1/X record-keeping.' }} />
      </Card>
      <PrescriptionDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o && params.get('new')) router.replace('/prescriptions'); }} prescription={null} defaultCustomerId={params.get('customerId') ?? undefined} onSaved={(p) => router.push(`/prescriptions/${p.id}`)} />
    </>
  );
}
