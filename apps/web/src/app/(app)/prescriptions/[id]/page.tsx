'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Pencil, FileText, Loader2 } from 'lucide-react';
import type { AttachmentRef } from '@pharmaos/shared';
import { usePrescription, useUpdatePrescription, prescriptionFileUrl } from '@/features/prescriptions/api';
import { PrescriptionDialog } from '@/features/prescriptions/prescription-dialog';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DocStatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Select } from '@/components/ui/input';

export default function PrescriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const rx = usePrescription(id);
  const update = useUpdatePrescription();
  const canManage = usePermission('prescriptions.manage');
  const [editOpen, setEditOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  if (rx.isPending) return <Spinner />;
  if (rx.isError) return <ErrorState message={errorMessage(rx.error)} onRetry={() => rx.refetch()} />;
  const p = rx.data;
  const openFile = async (f: AttachmentRef) => {
    setOpening(f.publicId);
    try { const { url } = await prescriptionFileUrl(p.id, f.publicId); window.open(url, '_blank', 'noopener'); } catch (e) { toast.error(errorMessage(e)); } finally { setOpening(null); }
  };
  return (
    <>
      <PageHeader title={`Prescription · Dr ${p.doctorName}`} description={<span className="flex items-center gap-2">For <Link href={`/customers/${p.customerId}`} className="text-primary-700 hover:underline">{p.customerName}</Link> · {formatDate(p.prescriptionDate)} <DocStatusBadge status={p.status} /></span>} actions={canManage ? <>
        <Select className="h-8 w-36" value={p.status} onChange={(e) => update.mutate({ id: p.id, input: { status: e.target.value as typeof p.status } }, { onSuccess: () => toast.success('Status updated'), onError: (err) => toast.error(errorMessage(err)) })} aria-label="Status"><option value="active">Active</option><option value="used">Used</option><option value="expired">Expired</option><option value="archived">Archived</option></Select>
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
      </> : null} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Medicines</CardTitle></CardHeader>
            {p.items.length === 0 ? <p className="px-5 py-4 text-[13px] text-fg-subtle">No medicines listed; see attached files.</p> : (
              <Table>
                <THead><TR><TH>Medicine</TH><TH>Dosage</TH><TH>Duration</TH><TH>Linked product</TH></TR></THead>
                <TBody>{p.items.map((i, idx) => <TR key={idx}><TD className="font-medium">{i.medicine}</TD><TD>{i.dosage || '—'}</TD><TD>{i.duration || '—'}</TD><TD>{i.productId ? <Link href={`/products/${i.productId}`} className="text-primary-700 hover:underline">Open product</Link> : '—'}</TD></TR>)}</TBody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader><CardTitle>Files</CardTitle></CardHeader>
            <CardContent>
              {p.files.length === 0 ? <p className="text-[13px] text-fg-subtle">No scans attached.</p> : (
                <ul className="divide-y divide-border rounded-[var(--radius-control)] border border-border">
                  {p.files.map((f) => (
                    <li key={f.publicId} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-fg-subtle" />
                      <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => void openFile(f as AttachmentRef)}>{f.originalName || f.publicId.split('/').pop()}</button>
                      <span className="text-[12px] text-fg-subtle">{Math.round(f.bytes / 1024)} KB</span>
                      {opening === f.publicId ? <Loader2 className="h-4 w-4 animate-spin text-fg-faint" /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent><KeyValue className="sm:grid-cols-1" items={[{ label: 'Doctor reg. no.', value: p.doctorRegNo || '—' }, { label: 'Hospital', value: p.hospital || '—' }, { label: 'Diagnosis', value: p.diagnosis || '—' }, { label: 'Valid until', value: p.validUntil ? formatDate(p.validUntil) : '—' }, { label: 'Customer phone', value: p.customerPhone }, { label: 'Notes', value: p.notes || '—' }, { label: 'Added', value: `${formatDateTime(p.createdAt)} · ${p.createdBy?.name ?? ''}` }]} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Dispensed in</CardTitle></CardHeader>
            {p.linkedSales.length === 0 ? <p className="px-5 py-4 text-[13px] text-fg-subtle">Not used on an invoice yet.</p> : <ul className="divide-y divide-border">{p.linkedSales.map((s) => <li key={s.id} className="flex justify-between px-5 py-2 text-sm"><Link href={`/sales/${s.id}`} className="font-medium hover:underline">{s.number}</Link><span className="text-fg-subtle">{formatDate(s.date)}</span></li>)}</ul>}
          </Card>
        </div>
      </div>
      <PrescriptionDialog open={editOpen} onOpenChange={setEditOpen} prescription={p} />
    </>
  );
}
