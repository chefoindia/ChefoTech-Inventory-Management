'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OutletDto, CreateOutletInput, UpdateOutletInput } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { meQueryKey } from '@/features/auth/api';

export const outletsKey = (includeArchived = false) => ['outlets', { includeArchived }] as const;

export function useOutlets(includeArchived = false) {
  return useQuery({
    queryKey: outletsKey(includeArchived),
    queryFn: () => api.get<OutletDto[]>('/outlets', { includeArchived }),
  });
}

function useInvalidateOutlets() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['outlets'] });
    qc.invalidateQueries({ queryKey: meQueryKey });
  };
}

export function useCreateOutlet() {
  const invalidate = useInvalidateOutlets();
  return useMutation({ mutationFn: (input: CreateOutletInput) => api.post<OutletDto>('/outlets', input), onSuccess: invalidate });
}

export function useUpdateOutlet() {
  const invalidate = useInvalidateOutlets();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOutletInput }) => api.patch<OutletDto>(`/outlets/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useArchiveOutlet() {
  const invalidate = useInvalidateOutlets();
  return useMutation({ mutationFn: (id: string) => api.post<OutletDto>(`/outlets/${id}/archive`), onSuccess: invalidate });
}
