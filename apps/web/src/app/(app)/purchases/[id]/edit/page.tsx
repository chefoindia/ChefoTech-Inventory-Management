'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { usePurchase } from '@/features/purchases/api';
import { PageHeader } from '@/components/ui/page-header';
import { PurchaseForm } from '@/features/purchases/purchase-form';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Alert } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-client';

export default function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const purchase = usePurchase(id);
  if (purchase.isPending) return <Spinner />;
  if (purchase.isError) return <ErrorState message={errorMessage(purchase.error)} onRetry={() => purchase.refetch()} />;
  const p = purchase.data;
  return (
    <>
      <PageHeader title={`Edit ${p.number}`} description={`Supplier invoice ${p.supplierInvoiceNumber} from ${p.supplierName}`} />
      {p.status !== 'draft' && p.status !== 'confirmed' ? <Alert variant="warning" className="mb-4" title="Stock already received">Line quantities and batches are locked once goods are received. Header fields, notes and attachments can still be updated.</Alert> : null}
      <PurchaseForm purchase={p} onSaved={() => router.push(`/purchases/${id}`)} onCancel={() => router.push(`/purchases/${id}`)} />
    </>
  );
}
