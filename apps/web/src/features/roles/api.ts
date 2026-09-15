'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoleDto, CreateRoleInput, UpdateRoleInput, PermissionGroup } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { meQueryKey } from '@/features/auth/api';

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleDto[]>('/roles') });
}

export function usePermissionCatalog() {
  return useQuery({ queryKey: ['roles', 'permissions'], queryFn: () => api.get<PermissionGroup[]>('/roles/permissions'), staleTime: Infinity });
}

function useInvalidateRoles() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['roles'] });
    qc.invalidateQueries({ queryKey: meQueryKey });
  };
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: (input: CreateRoleInput) => api.post<RoleDto>('/roles', input), onSuccess: invalidate });
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleInput }) => api.patch<RoleDto>(`/roles/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: (id: string) => api.delete(`/roles/${id}`), onSuccess: invalidate });
}
