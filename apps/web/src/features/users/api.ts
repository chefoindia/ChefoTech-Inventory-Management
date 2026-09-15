'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MembershipDto, InviteUserInput, UpdateMembershipInput, UpdateProfileInput, UserDto } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { meQueryKey } from '@/features/auth/api';

export interface InvitationDto {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  outletAccess: { all: boolean; outletIds: string[] };
  expiresAt: string;
  emailStatus: 'pending' | 'sent' | 'failed';
  createdAt: string;
}

export function useMembers(params: { page: number; pageSize?: number; q?: string }) {
  return useQuery({
    queryKey: ['members', params],
    queryFn: () => api.getPaged<MembershipDto>('/users', { page: params.page, pageSize: params.pageSize ?? 25, q: params.q }),
    placeholderData: (prev) => prev,
  });
}

export function useInvitations() {
  return useQuery({ queryKey: ['invitations'], queryFn: () => api.get<InvitationDto[]>('/users/invitations') });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteUserInput) =>
      api.post<{ id: string; email: string; emailStatus: string; expiresAt: string }>('/users/invite', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] });
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/invitations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  });
}

export function useUpdateMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMembershipInput }) => api.patch<MembershipDto>(`/users/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.patch<UserDto>('/users/me/profile', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: meQueryKey }),
  });
}
