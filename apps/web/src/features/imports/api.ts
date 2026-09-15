'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImportJobDto, ImportEntity, ImportColumn, CreateImportInput } from '@pharmaos/shared';
import { api } from '@/lib/api-client';

export function useImports() {
  return useQuery({ queryKey: ['imports', 'list'], queryFn: () => api.get<ImportJobDto[]>('/imports') });
}
export function useImportJob(id: string | null) {
  return useQuery({ queryKey: ['imports', 'detail', id], queryFn: () => api.get<ImportJobDto>(`/imports/${id}`), enabled: !!id });
}
export function useImportColumns(entity: ImportEntity) {
  return useQuery({ queryKey: ['imports', 'columns', entity], queryFn: () => api.get<ImportColumn[]>(`/imports/columns/${entity}`), staleTime: Infinity });
}
export function useCreateImport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateImportInput) => api.post<ImportJobDto & { unknownHeaders: string[] }>('/imports', input), onSuccess: () => qc.invalidateQueries({ queryKey: ['imports'] }) });
}
export function useCommitImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ImportJobDto>(`/imports/${id}/commit`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imports'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
export function useDiscardImport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/imports/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['imports'] }) });
}
