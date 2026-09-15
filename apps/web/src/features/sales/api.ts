'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaleDto, SaleQuoteDto, CreateSaleInput, QuoteSaleInput, HoldSaleInput, HeldSaleSummary, SalesReturnDto, CreateSalesReturnInput } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { useSession } from '@/stores/session';

const useOutlet = () => useSession((s) => s.activeOutletId);

function useInvalidateSales() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['payments'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function useSales(params: { page: number; q?: string; customerId?: string; status?: string; paymentStatus?: string; soldBy?: string; from?: string; to?: string }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['sales', 'list', params, outletId], queryFn: () => api.getPaged<SaleDto>('/sales', { ...params, pageSize: 25 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function useSale(id: string | null) {
  return useQuery({ queryKey: ['sales', 'detail', id], queryFn: () => api.get<SaleDto>(`/sales/${id}`), enabled: !!id });
}
export function useQuoteSale() {
  return useMutation({ mutationFn: (input: QuoteSaleInput) => api.post<SaleQuoteDto>('/sales/quote', input) });
}
export function useCreateSale() {
  const inv = useInvalidateSales();
  return useMutation({ mutationFn: ({ input, idempotencyKey }: { input: CreateSaleInput; idempotencyKey: string }) => api.post<SaleDto>('/sales', input, { idempotencyKey }), onSuccess: inv });
}
export function useCancelSale() {
  const inv = useInvalidateSales();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<SaleDto>(`/sales/${id}/cancel`, { reason }), onSuccess: inv });
}

/* held bills */
export function useHeldSales() {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['sales', 'held', outletId], queryFn: () => api.get<HeldSaleSummary[]>('/sales/held'), enabled: !!outletId, staleTime: 5_000 });
}
export function useHoldSale() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: HoldSaleInput) => api.post<{ id: string; label: string; estimatedTotalMinor: number }>('/sales/held', input), onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'held'] }) });
}
export async function fetchHeld(id: string) {
  return api.get<{ id: string; label: string; input: HoldSaleInput; createdAt: string }>(`/sales/held/${id}`);
}
export function useDeleteHeld() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/sales/held/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'held'] }) });
}

/* returns */
export function useSalesReturns(params: { page: number; saleId?: string; customerId?: string }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['sales', 'returns', params, outletId], queryFn: () => api.getPaged<SalesReturnDto>('/sales-returns', { ...params, pageSize: 25 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function useSalesReturn(id: string | null) {
  return useQuery({ queryKey: ['sales', 'return', id], queryFn: () => api.get<SalesReturnDto>(`/sales-returns/${id}`), enabled: !!id });
}
export function useCreateSalesReturn() {
  const inv = useInvalidateSales();
  return useMutation({ mutationFn: ({ input, idempotencyKey }: { input: CreateSalesReturnInput; idempotencyKey: string }) => api.post<SalesReturnDto>('/sales-returns', input, { idempotencyKey }), onSuccess: inv });
}
