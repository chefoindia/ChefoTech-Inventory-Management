'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PrescriptionDto, CreatePrescriptionInput, UpdatePrescriptionInput } from '@pharmaos/shared';
import { api } from '@/lib/api-client';

export function usePrescriptions(params: { page: number; q?: string; customerId?: string; status?: string; from?: string; to?: string }) {
  return useQuery({ queryKey: ['prescriptions', 'list', params], queryFn: () => api.getPaged<PrescriptionDto>('/prescriptions', { ...params, pageSize: 25 }), placeholderData: (p) => p });
}
export function usePrescription(id: string | null) {
  return useQuery({ queryKey: ['prescriptions', 'detail', id], queryFn: () => api.get<PrescriptionDto>(`/prescriptions/${id}`), enabled: !!id });
}
export function useCreatePrescription() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreatePrescriptionInput) => api.post<PrescriptionDto>('/prescriptions', input), onSuccess: () => qc.invalidateQueries({ queryKey: ['prescriptions'] }) });
}
export function useUpdatePrescription() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdatePrescriptionInput }) => api.patch<PrescriptionDto>(`/prescriptions/${id}`, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['prescriptions'] }) });
}
export async function prescriptionFileUrl(id: string, publicId: string) {
  return api.get<{ url: string; expiresInSeconds: number }>(`/prescriptions/${id}/files/url`, { publicId });
}
