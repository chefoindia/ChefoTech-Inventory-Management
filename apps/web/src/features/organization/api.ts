'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrganizationDto, UpdateOrganizationInput } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { meQueryKey } from '@/features/auth/api';

export const organizationKey = ['organization'] as const;

export function useOrganization() {
  return useQuery({ queryKey: organizationKey, queryFn: () => api.get<OrganizationDto>('/organization') });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOrganizationInput) => api.patch<OrganizationDto>('/organization', input),
    onSuccess: (data) => {
      qc.setQueryData(organizationKey, data);
      qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}
