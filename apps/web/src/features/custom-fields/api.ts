'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomFieldDto, CreateCustomFieldInput, UpdateCustomFieldInput, CustomFieldEntity } from '@pharmaos/shared';
import { api } from '@/lib/api-client';

export function useCustomFields(entity?: CustomFieldEntity, includeArchived = false) {
  return useQuery({ queryKey: ['custom-fields', entity ?? 'all', includeArchived], queryFn: () => api.get<CustomFieldDto[]>('/custom-fields', { entity, includeArchived }), staleTime: 60_000 });
}
export function useCreateCustomField() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateCustomFieldInput) => api.post<CustomFieldDto>('/custom-fields', input), onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }) });
}
export function useUpdateCustomField() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateCustomFieldInput }) => api.patch<CustomFieldDto>(`/custom-fields/${id}`, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }) });
}
export function useArchiveCustomField() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/custom-fields/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }) });
}
