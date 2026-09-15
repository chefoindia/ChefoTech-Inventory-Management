'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useProduct } from '@/features/catalog/api';
import { PageHeader } from '@/components/ui/page-header';
import { ProductForm } from '@/features/catalog/product-form';
import { Spinner, ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api-client';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const product = useProduct(id);
  if (product.isPending) return <Spinner />;
  if (product.isError) return <ErrorState message={errorMessage(product.error)} onRetry={() => product.refetch()} />;
  return (
    <>
      <PageHeader title={`Edit ${product.data.name}`} description="Changes apply to future stock and bills; existing batches keep their own MRP." />
      <ProductForm product={product.data} onSaved={() => router.push(`/products/${id}`)} onCancel={() => router.push(`/products/${id}`)} />
    </>
  );
}
