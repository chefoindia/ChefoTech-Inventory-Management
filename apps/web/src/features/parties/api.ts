'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupplierDto, CustomerDto, CreateSupplierInput, UpdateSupplierInput, CreateCustomerInput, UpdateCustomerInput, LedgerEntryDto, PartyPaymentDto, PartyPaymentInput, LedgerAdjustmentInput, AttachmentRef, SaleDto } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { useSession } from '@/stores/session';

export interface PartyListParams {
  page: number;
  pageSize?: number;
  q?: string;
  status?: string;
  hasBalance?: boolean;
  sort?: string;
}

export interface OutstandingDoc {
  id: string;
  number: string;
  date: string;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  dueDate: string | null;
  overdue: boolean;
}

/* ---------------------------------------------------------------- suppliers */
export function useSuppliers(params: PartyListParams) {
  return useQuery({ queryKey: ['suppliers', 'list', params], queryFn: () => api.getPaged<SupplierDto>('/suppliers', { ...params, pageSize: params.pageSize ?? 25 }), placeholderData: (p) => p });
}
export function useSupplier(id: string | null) {
  return useQuery({ queryKey: ['suppliers', 'detail', id], queryFn: () => api.get<SupplierDto>(`/suppliers/${id}`), enabled: !!id });
}
export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateSupplierInput) => api.post<SupplierDto>('/suppliers', input), onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }) });
}
export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateSupplierInput }) => api.patch<SupplierDto>(`/suppliers/${id}`, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }) });
}
export function useSupplierLedger(id: string | null, page = 1) {
  return useQuery({ queryKey: ['suppliers', 'ledger', id, page], queryFn: () => api.getPaged<LedgerEntryDto>(`/suppliers/${id}/ledger`, { page, pageSize: 25 }), enabled: !!id });
}
export function useSupplierDocument() {
  const qc = useQueryClient();
  return {
    add: useMutation({ mutationFn: ({ id, attachment }: { id: string; attachment: AttachmentRef }) => api.post<SupplierDto>(`/suppliers/${id}/documents`, { attachment }), onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }) }),
    remove: useMutation({ mutationFn: ({ id, publicId }: { id: string; publicId: string }) => api.delete<SupplierDto>(`/suppliers/${id}/documents`, { body: { publicId } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }) }),
  };
}

/* ---------------------------------------------------------------- customers */
export function useCustomers(params: PartyListParams) {
  return useQuery({ queryKey: ['customers', 'list', params], queryFn: () => api.getPaged<CustomerDto>('/customers', { ...params, pageSize: params.pageSize ?? 25 }), placeholderData: (p) => p });
}
export function useCustomer(id: string | null) {
  return useQuery({ queryKey: ['customers', 'detail', id], queryFn: () => api.get<CustomerDto>(`/customers/${id}`), enabled: !!id });
}
export function useCustomerSearch(q: string) {
  return useQuery({ queryKey: ['customers', 'search', q], queryFn: () => api.get<CustomerDto[]>('/customers/search', { q, limit: 10 }), enabled: q.trim().length > 0, staleTime: 10_000 });
}
export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateCustomerInput) => api.post<CustomerDto & { duplicatePhoneWarning?: string }>('/customers', input), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) });
}
export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) => api.patch<CustomerDto>(`/customers/${id}`, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) });
}
export function useCustomerLedger(id: string | null, page = 1) {
  return useQuery({ queryKey: ['customers', 'ledger', id, page], queryFn: () => api.getPaged<LedgerEntryDto>(`/customers/${id}/ledger`, { page, pageSize: 25 }), enabled: !!id });
}
export function useCustomerSales(id: string | null, page = 1) {
  return useQuery({ queryKey: ['customers', 'sales', id, page], queryFn: () => api.getPaged<SaleDto>(`/sales/by-customer/${id}`, { page, pageSize: 25 }), enabled: !!id });
}
export function useCustomerDocument() {
  const qc = useQueryClient();
  return {
    add: useMutation({ mutationFn: ({ id, attachment }: { id: string; attachment: AttachmentRef }) => api.post<CustomerDto>(`/customers/${id}/documents`, { attachment }), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) }),
    remove: useMutation({ mutationFn: ({ id, publicId }: { id: string; publicId: string }) => api.delete<CustomerDto>(`/customers/${id}/documents`, { body: { publicId } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) }),
  };
}
export function useLedgerAdjustment(partyType: 'customer' | 'supplier') {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: LedgerAdjustmentInput) => api.post<{ balanceAfterMinor: number }>(`/${partyType}s/ledger-adjustments`, input), onSuccess: () => qc.invalidateQueries({ queryKey: [`${partyType}s`] }) });
}

/* ---------------------------------------------------------------- payments */
export function usePayments(partyType: 'customer' | 'supplier', params: { page: number; partyId?: string; from?: string; to?: string }) {
  const outletId = useSession((s) => s.activeOutletId);
  return useQuery({ queryKey: ['payments', partyType, params, outletId], queryFn: () => api.getPaged<PartyPaymentDto>(`/${partyType}-payments`, { ...params, pageSize: 25 }), placeholderData: (p) => p });
}
export function useOutstanding(partyType: 'customer' | 'supplier', partyId: string | null) {
  return useQuery({ queryKey: ['payments', partyType, 'outstanding', partyId], queryFn: () => api.get<OutstandingDoc[]>(`/${partyType}-payments/outstanding/${partyId}`), enabled: !!partyId });
}
export function useRecordPayment(partyType: 'customer' | 'supplier') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: PartyPaymentInput; idempotencyKey: string }) => api.post<PartyPaymentDto>(`/${partyType}-payments`, input, { idempotencyKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: [`${partyType}s`] });
      qc.invalidateQueries({ queryKey: partyType === 'customer' ? ['sales'] : ['purchases'] });
    },
  });
}
export function useCancelPayment(partyType: 'customer' | 'supplier') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<PartyPaymentDto>(`/${partyType}-payments/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: [`${partyType}s`] });
      qc.invalidateQueries({ queryKey: partyType === 'customer' ? ['sales'] : ['purchases'] });
    },
  });
}
