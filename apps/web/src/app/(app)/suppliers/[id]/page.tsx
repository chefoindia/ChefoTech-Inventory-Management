'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Wallet, Truck, Undo2, Archive } from 'lucide-react';
import type { PurchaseDto } from '@pharmaos/shared';
import { useSupplier, useSupplierDocument, useUpdateSupplier } from '@/features/parties/api';
import { usePurchases } from '@/features/purchases/api';
import { SupplierDialog } from '@/features/parties/party-forms';
import { LedgerTab } from '@/features/parties/ledger-tab';
import { RecordPaymentDialog } from '@/features/parties/payment-dialog';
import { PurchaseReturnDialog } from '@/features/purchases/purchase-return-dialog';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue, Stat } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge, PaymentStatusBadge, DocStatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FileUpload, AttachmentList } from '@/components/ui/file-upload';
import { CustomFieldsView } from '@/components/ui/custom-fields-form';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supplier = useSupplier(id);
  const update = useUpdateSupplier();
  const docs = useSupplierDocument();
  const canManage = usePermission('suppliers.manage');
  const canLedger = usePermission('suppliers.viewLedger');
  const canPay = usePermission('purchases.pay');
  const canReturn = usePermission('purchases.return');
  const canPurchases = usePermission('purchases.view');
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  if (supplier.isPending) return <Spinner />;
  if (supplier.isError) return <ErrorState message={errorMessage(supplier.error)} onRetry={() => supplier.refetch()} />;
  const s = supplier.data;
  return (
    <>
      <PageHeader title={s.name} description={<span className="flex flex-wrap items-center gap-2">{[s.contactPerson, s.phone, s.email, s.gstin].filter(Boolean).join(' · ')} <StatusBadge status={s.status} /></span>} actions={<>
        {canPurchases ? <Link href="/purchases/new" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Truck className="h-3.5 w-3.5" /> New purchase</Link> : null}
        {canReturn ? <Button variant="secondary" size="sm" onClick={() => setReturnOpen(true)}><Undo2 className="h-3.5 w-3.5" /> Return goods</Button> : null}
        {canPay && s.balanceMinor > 0 ? <Button size="sm" onClick={() => setPayOpen(true)}><Wallet className="h-3.5 w-3.5" /> Pay {money(s.balanceMinor)}</Button> : null}
        {canManage ? <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button> : null}
        {canManage && s.status !== 'archived' ? <Button variant="ghost" size="sm" onClick={() => setArchiving(true)}><Archive className="h-3.5 w-3.5" /> Archive</Button> : null}
      </>} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {canLedger ? <Stat label="Payable" value={<span className={s.balanceMinor > 0 ? 'text-danger-600' : ''}>{money(s.balanceMinor)}</span>} hint={`Terms ${s.paymentTermsDays} days`} /> : null}
        <Stat label="GST" value={<span className="text-lg">{s.gstin || 'Unregistered'}</span>} hint={s.stateCode ? `State ${s.stateCode}` : ''} />
        <Stat label="Drug licence" value={<span className="text-lg">{s.drugLicenseNo || '—'}</span>} hint={s.pan ? `PAN ${s.pan}` : ''} />
        <Stat label="Since" value={<span className="text-lg">{formatDate(s.createdAt)}</span>} hint={s.code ? `Code ${s.code}` : ''} />
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canLedger ? <TabsTrigger value="ledger">Ledger</TabsTrigger> : null}
          {canPurchases ? <TabsTrigger value="purchases">Purchases</TabsTrigger> : null}
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <KeyValue items={[
                { label: 'Contact person', value: s.contactPerson || '—' }, { label: 'Phone', value: [s.phone, s.altPhone].filter(Boolean).join(' / ') || '—' }, { label: 'Email', value: s.email || '—' },
                { label: 'Address', value: [s.address?.line1, s.address?.line2, s.address?.city, s.address?.state, s.address?.pincode].filter(Boolean).join(', ') || '—' },
                { label: 'Bank', value: s.bank?.accountNumber ? `${s.bank.accountName} · ${s.bank.accountNumber} · ${s.bank.ifsc}` : s.bank?.upiId || '—' }, { label: 'UPI', value: s.bank?.upiId || '—' },
                { label: 'Opening balance', value: money(s.openingBalanceMinor) }, { label: 'Notes', value: s.notes || '—' },
              ]} />
              <CustomFieldsView entity="supplier" values={s.customFields} />
            </CardContent>
          </Card>
        </TabsContent>
        {canLedger ? <TabsContent value="ledger"><LedgerTab partyType="supplier" partyId={s.id} balanceMinor={s.balanceMinor} /></TabsContent> : null}
        {canPurchases ? <TabsContent value="purchases"><SupplierPurchases id={s.id} /></TabsContent> : null}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Documents</CardTitle>{canManage ? <FileUpload purpose="supplierDocument" entityId={s.id} multiple onUploaded={(refs) => refs.forEach((r) => docs.add.mutate({ id: s.id, attachment: r }))} /> : null}</CardHeader>
            <CardContent><AttachmentList items={s.documents} onRemove={canManage ? (publicId) => docs.remove.mutate({ id: s.id, publicId }) : undefined} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SupplierDialog open={editOpen} onOpenChange={setEditOpen} supplier={s} />
      <RecordPaymentDialog partyType="supplier" open={payOpen} onOpenChange={setPayOpen} partyId={s.id} />
      <PurchaseReturnDialog open={returnOpen} onOpenChange={setReturnOpen} supplierId={s.id} onDone={(rid) => router.push(`/purchases/returns/${rid}`)} />
      <ConfirmDialog open={archiving} onOpenChange={setArchiving} title={`Archive ${s.name}?`} description="Hidden from pickers; purchases and ledger history remain." confirmLabel="Archive" destructive loading={update.isPending} onConfirm={() => update.mutate({ id: s.id, input: { status: 'archived' } }, { onSuccess: () => { toast.success('Supplier archived'); router.push('/suppliers'); }, onError: (e) => toast.error(errorMessage(e)) })} />
    </>
  );
}

function SupplierPurchases({ id }: { id: string }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const purchases = usePurchases({ page, supplierId: id });
  const canCost = usePermission('products.viewCost');
  const columns: Column<PurchaseDto>[] = [
    { key: 'number', header: 'Purchase', cell: (p) => <div><div className="font-medium">{p.number}</div><div className="text-[12px] text-fg-subtle">Inv {p.supplierInvoiceNumber} · {formatDate(p.invoiceDate)}</div></div> },
    { key: 'items', header: 'Items', numeric: true, cell: (p) => p.lines.length },
    ...(canCost ? [{ key: 'total', header: 'Total', numeric: true, cell: (p: PurchaseDto) => money(p.totals.grandTotalMinor) }, { key: 'balance', header: 'Balance', numeric: true, cell: (p: PurchaseDto) => p.balanceMinor ? <span className="text-danger-600">{money(p.balanceMinor)}</span> : '—' }] : []),
    { key: 'due', header: 'Due', cell: (p) => p.dueDate ? formatDate(p.dueDate) : '—' },
    { key: 'status', header: 'Receipt', cell: (p) => <DocStatusBadge status={p.status} /> },
    { key: 'pay', header: 'Payment', cell: (p) => p.status === 'cancelled' ? '—' : <PaymentStatusBadge status={p.paymentStatus} /> },
  ];
  return <Card><DataTable columns={columns} rows={purchases.data?.items} rowKey={(p) => p.id} isPending={purchases.isPending} isError={purchases.isError} error={purchases.error} meta={purchases.data?.meta} onPageChange={setPage} onRowClick={(p) => router.push(`/purchases/${p.id}`)} empty={{ icon: Truck, title: 'No purchases from this supplier at this outlet' }} /></Card>;
}
