'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PurchaseDto, CreatePurchaseInput, UpdatePurchaseInput, GrnDto, CreateGrnInput, PurchaseReturnDto, CreatePurchaseReturnInput } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { useSession } from '@/stores/session';

const useOutlet = () => useSession((s) => s.activeOutletId);

function useInvalidatePurchases() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['purchases'] });
    qc.invalidateQueries({ queryKey: ['grns'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    qc.invalidateQueries({ queryKey: ['payments'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function usePurchases(params: { page: number; q?: string; supplierId?: string; status?: string; paymentStatus?: string; from?: string; to?: string }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['purchases', 'list', params, outletId], queryFn: () => api.getPaged<PurchaseDto>('/purchases', { ...params, pageSize: 25 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function usePurchase(id: string | null) {
  return useQuery({ queryKey: ['purchases', 'detail', id], queryFn: () => api.get<PurchaseDto>(`/purchases/${id}`), enabled: !!id });
}
export function useCreatePurchase() {
  const inv = useInvalidatePurchases();
  return useMutation({ mutationFn: ({ input, idempotencyKey }: { input: CreatePurchaseInput; idempotencyKey: string }) => api.post<PurchaseDto>('/purchases', input, { idempotencyKey }), onSuccess: inv });
}
export function useUpdatePurchase() {
  const inv = useInvalidatePurchases();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdatePurchaseInput }) => api.patch<PurchaseDto>(`/purchases/${id}`, input), onSuccess: inv });
}
export function useCancelPurchase() {
  const inv = useInvalidatePurchases();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<PurchaseDto>(`/purchases/${id}/cancel`, { reason }), onSuccess: inv });
}

export function useGrns(params: { page: number; purchaseId?: string; status?: string }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['grns', params, outletId], queryFn: () => api.getPaged<GrnDto>('/grns', { ...params, pageSize: 25 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function useGrn(id: string | null) {
  return useQuery({ queryKey: ['grns', 'detail', id], queryFn: () => api.get<GrnDto>(`/grns/${id}`), enabled: !!id });
}
export function useCreateGrn() {
  const inv = useInvalidatePurchases();
  return useMutation({ mutationFn: ({ input, idempotencyKey }: { input: CreateGrnInput; idempotencyKey: string }) => api.post<GrnDto>('/grns', input, { idempotencyKey }), onSuccess: inv });
}
export function useConfirmGrn() {
  const inv = useInvalidatePurchases();
  return useMutation({ mutationFn: (id: string) => api.post<GrnDto>(`/grns/${id}/confirm`), onSuccess: inv });
}

export function usePurchaseReturns(params: { page: number; supplierId?: string }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['purchases', 'returns', params, outletId], queryFn: () => api.getPaged<PurchaseReturnDto>('/purchase-returns', { ...params, pageSize: 25 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function usePurchaseReturn(id: string | null) {
  return useQuery({ queryKey: ['purchases', 'return', id], queryFn: () => api.get<PurchaseReturnDto>(`/purchase-returns/${id}`), enabled: !!id });
}
export function useCreatePurchaseReturn() {
  const inv = useInvalidatePurchases();
  return useMutation({ mutationFn: ({ input, idempotencyKey }: { input: CreatePurchaseReturnInput; idempotencyKey: string }) => api.post<PurchaseReturnDto>('/purchase-returns', input, { idempotencyKey }), onSuccess: inv });
}
