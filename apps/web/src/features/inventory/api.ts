'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockOverviewRow, BatchRow, MovementRow, AdjustmentDto, ExpirySummary, TransferDto, OpeningStockInput, CreateAdjustmentInput, CreateTransferInput, ReceiveTransferInput } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { useSession } from '@/stores/session';

const useOutlet = () => useSession((s) => s.activeOutletId);

export function useStock(params: { page: number; q?: string; categoryId?: string; onlyInStock?: boolean; lowStock?: boolean; outletId?: string }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['inventory', 'stock', params, outletId], queryFn: () => api.getPaged<StockOverviewRow>('/inventory/stock', { ...params, pageSize: 50 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function useLowStock(page = 1, q?: string) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['inventory', 'low-stock', page, q, outletId], queryFn: () => api.getPaged<StockOverviewRow>('/inventory/low-stock', { page, q, pageSize: 50 }), enabled: !!outletId });
}
export function useBatches(params: { page: number; productId?: string; expiryStatus?: string; withinDays?: number; includeZero?: boolean; q?: string }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['inventory', 'batches', params, outletId], queryFn: () => api.getPaged<BatchRow>('/inventory/batches', { ...params, pageSize: 50 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function useMovements(params: { page: number; productId?: string; batchId?: string; reason?: string; from?: string; to?: string }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['inventory', 'movements', params, outletId], queryFn: () => api.getPaged<MovementRow>('/inventory/movements', { ...params, pageSize: 50 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function useExpirySummary() {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['inventory', 'expiry', outletId], queryFn: () => api.get<ExpirySummary>('/inventory/expiry'), enabled: !!outletId });
}

function useInvalidateInventory() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function usePostOpeningStock() {
  const inv = useInvalidateInventory();
  return useMutation({ mutationFn: ({ input, idempotencyKey }: { input: OpeningStockInput; idempotencyKey: string }) => api.post<{ number: string; lines: number }>('/inventory/opening-stock', input, { idempotencyKey }), onSuccess: inv });
}
export function useUpdateBatch() {
  const inv = useInvalidateInventory();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: { expiryDate?: string; mfgDate?: string | null; sellingPriceMinor?: number; mrpMinor?: number } }) => api.patch(`/inventory/batches/${id}`, input), onSuccess: inv });
}
export function useBlockBatch() {
  const inv = useInvalidateInventory();
  return useMutation({ mutationFn: ({ id, blocked, reason }: { id: string; blocked: boolean; reason?: string }) => api.post(`/inventory/batches/${id}/block`, { blocked, reason }), onSuccess: inv });
}
export function useWriteOff() {
  const inv = useInvalidateInventory();
  return useMutation({ mutationFn: ({ input, idempotencyKey }: { input: { batchId: string; qtyBase: number; kind: 'expiry' | 'damage'; note?: string }; idempotencyKey: string }) => api.post<AdjustmentDto>('/inventory/write-off', input, { idempotencyKey }), onSuccess: inv });
}

/* adjustments */
export function useAdjustments(params: { page: number; status?: string; type?: string }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['inventory', 'adjustments', params, outletId], queryFn: () => api.getPaged<AdjustmentDto>('/inventory/adjustments', { ...params, pageSize: 25 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function useAdjustment(id: string | null) {
  return useQuery({ queryKey: ['inventory', 'adjustment', id], queryFn: () => api.get<AdjustmentDto>(`/inventory/adjustments/${id}`), enabled: !!id });
}
export function useCreateAdjustment() {
  const inv = useInvalidateInventory();
  return useMutation({ mutationFn: ({ input, idempotencyKey }: { input: CreateAdjustmentInput; idempotencyKey: string }) => api.post<AdjustmentDto>('/inventory/adjustments', input, { idempotencyKey }), onSuccess: inv });
}
export function useApproveAdjustment() {
  const inv = useInvalidateInventory();
  return useMutation({ mutationFn: (id: string) => api.post<AdjustmentDto>(`/inventory/adjustments/${id}/approve`), onSuccess: inv });
}
export function useRejectAdjustment() {
  const inv = useInvalidateInventory();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<AdjustmentDto>(`/inventory/adjustments/${id}/reject`, { reason }), onSuccess: inv });
}

/* transfers */
export function useTransfers(params: { page: number; status?: string; direction?: 'in' | 'out' | 'all' }) {
  const outletId = useOutlet();
  return useQuery({ queryKey: ['inventory', 'transfers', params, outletId], queryFn: () => api.getPaged<TransferDto>('/transfers', { ...params, pageSize: 25 }), enabled: !!outletId, placeholderData: (p) => p });
}
export function useTransfer(id: string | null) {
  return useQuery({ queryKey: ['inventory', 'transfer', id], queryFn: () => api.get<TransferDto>(`/transfers/${id}`), enabled: !!id });
}
export function useCreateTransfer() {
  const inv = useInvalidateInventory();
  return useMutation({ mutationFn: ({ input, idempotencyKey }: { input: CreateTransferInput; idempotencyKey: string }) => api.post<TransferDto>('/transfers', input, { idempotencyKey }), onSuccess: inv });
}
export function useTransferAction() {
  const inv = useInvalidateInventory();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: 'approve' | 'dispatch' | 'receive' | 'cancel'; body?: ReceiveTransferInput | { reason: string } }) => api.post<TransferDto>(`/transfers/${id}/${action}`, body),
    onSuccess: inv,
  });
}
