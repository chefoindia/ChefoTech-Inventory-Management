'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductDto, ProductSearchHit, CreateProductInput, UpdateProductInput, CategoryDto, CreateCategoryInput, UpdateCategoryInput, UnitDto, CreateUnitInput, AttachmentRef, StarterCatalogueItem, AddStarterProductsResult } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { useSession } from '@/stores/session';

export interface ProductListParams {
  page: number;
  pageSize?: number;
  q?: string;
  categoryId?: string;
  status?: string;
  schedule?: string;
  requiresPrescription?: boolean;
  sort?: string;
}

const invalidateProducts = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['products'] });
  qc.invalidateQueries({ queryKey: ['inventory'] });
};

export function useProducts(params: ProductListParams) {
  const outletId = useSession((s) => s.activeOutletId);
  return useQuery({ queryKey: ['products', 'list', params, outletId], queryFn: () => api.getPaged<ProductDto>('/products', { ...params, pageSize: params.pageSize ?? 25 }), placeholderData: (p) => p });
}

export function useProduct(id: string | null) {
  const outletId = useSession((s) => s.activeOutletId);
  return useQuery({ queryKey: ['products', 'detail', id, outletId], queryFn: () => api.get<ProductDto>(`/products/${id}`), enabled: !!id });
}

export function useProductSearch(q: string, withStock = false, limit = 15) {
  const outletId = useSession((s) => s.activeOutletId);
  return useQuery({ queryKey: ['products', 'search', q, withStock, outletId], queryFn: () => api.get<ProductSearchHit[]>('/products/search', { q, withStock, limit }), enabled: q.trim().length > 0, staleTime: 10_000 });
}

export async function lookupBarcode(code: string): Promise<ProductSearchHit> {
  return api.get<ProductSearchHit>(`/products/by-barcode/${encodeURIComponent(code)}`);
}

/** Common medicines a new pharmacy can add in one click, flagged with what it already stocks. */
export function useStarterCatalogue() {
  return useQuery({ queryKey: ['products', 'starter-catalogue'], queryFn: () => api.get<StarterCatalogueItem[]>('/products/starter-catalogue'), staleTime: 30_000 });
}

export function useAddStarterProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keys: string[]) => api.post<AddStarterProductsResult>('/products/starter-catalogue', { keys }),
    onSuccess: () => invalidateProducts(qc),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateProductInput) => api.post<ProductDto>('/products', input), onSuccess: () => invalidateProducts(qc) });
}
export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) => api.patch<ProductDto>(`/products/${id}`, input), onSuccess: () => invalidateProducts(qc) });
}
export function useArchiveProduct() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.post(`/products/${id}/archive`), onSuccess: () => invalidateProducts(qc) });
}
export function useGenerateBarcode() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, unitId }: { id: string; unitId?: string }) => api.post<ProductDto>(`/products/${id}/barcodes/generate`, { unitId }), onSuccess: () => invalidateProducts(qc) });
}
export function useAddBarcode() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, code, unitId, isPrimary }: { id: string; code: string; unitId?: string; isPrimary?: boolean }) => api.post<ProductDto>(`/products/${id}/barcodes`, { code, unitId, isPrimary }), onSuccess: () => invalidateProducts(qc) });
}
export function useRemoveBarcode() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, code }: { id: string; code: string }) => api.delete<ProductDto>(`/products/${id}/barcodes/${encodeURIComponent(code)}`), onSuccess: () => invalidateProducts(qc) });
}
export function useProductAttachment() {
  const qc = useQueryClient();
  return {
    add: useMutation({ mutationFn: ({ id, kind, attachment }: { id: string; kind: 'images' | 'documents'; attachment: AttachmentRef }) => api.post<ProductDto>(`/products/${id}/attachments`, { kind, attachment }), onSuccess: () => invalidateProducts(qc) }),
    remove: useMutation({ mutationFn: ({ id, kind, publicId }: { id: string; kind: 'images' | 'documents'; publicId: string }) => api.delete<ProductDto>(`/products/${id}/attachments`, { body: { kind, publicId } }), onSuccess: () => invalidateProducts(qc) }),
  };
}

/* categories */
export function useCategories(includeInactive = false) {
  return useQuery({ queryKey: ['categories', includeInactive], queryFn: () => api.get<CategoryDto[]>('/categories', { includeInactive }), staleTime: 60_000 });
}
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateCategoryInput) => api.post<CategoryDto>('/categories', input), onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) });
}
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) => api.patch<CategoryDto>(`/categories/${id}`, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) });
}
export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/categories/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) });
}

/* units */
export function useUnits(includeInactive = false) {
  return useQuery({ queryKey: ['units', includeInactive], queryFn: () => api.get<UnitDto[]>('/units', { includeInactive }), staleTime: 60_000 });
}
export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateUnitInput) => api.post<UnitDto>('/units', input), onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }) });
}
export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: Partial<CreateUnitInput> & { status?: string } }) => api.patch<UnitDto>(`/units/${id}`, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }) });
}
