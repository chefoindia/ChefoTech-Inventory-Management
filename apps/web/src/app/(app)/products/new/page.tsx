'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { ProductForm } from '@/features/catalog/product-form';

export default function NewProductPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="New product" description="Define units, pricing and tax once; stock is added through purchases or opening stock." />
      <ProductForm product={null} onSaved={(p) => router.replace(`/products/${p.id}`)} onCancel={() => router.push('/products')} />
    </>
  );
}
