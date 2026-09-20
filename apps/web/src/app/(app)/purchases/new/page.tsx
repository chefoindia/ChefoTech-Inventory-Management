'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { PurchaseForm } from '@/features/purchases/purchase-form';

export default function NewPurchasePage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="New purchase" description="Record a supplier invoice. Receive stock immediately or later through a goods receipt." />
      <PurchaseForm purchase={null} onSaved={(p) => router.replace(`/purchases/${p.id}`)} onCancel={() => router.push('/purchases')} />
    </>
  );
}
