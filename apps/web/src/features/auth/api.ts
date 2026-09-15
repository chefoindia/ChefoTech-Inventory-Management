'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeDto, RegisterInput, LoginInput, ChangePasswordInput, SessionDto } from '@pharmaos/shared';
import { api, refreshAccessToken } from '@/lib/api-client';
import { useSession } from '@/stores/session';

interface AuthPayload {
  accessToken: string;
  accessTokenExpiresAt: string;
  me: MeDto;
}

export const meQueryKey = ['auth', 'me'] as const;

function applyAuth(payload: AuthPayload) {
  const s = useSession.getState();
  s.setTokens(payload.accessToken, payload.accessTokenExpiresAt);
  s.setMe(payload.me);
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => api.post<AuthPayload>('/auth/register', input, { anonymous: true }),
    onSuccess: (data) => {
      applyAuth(data);
      qc.setQueryData(meQueryKey, data.me);
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<AuthPayload>('/auth/login', input, { anonymous: true }),
    onSuccess: (data) => {
      applyAuth(data);
      qc.setQueryData(meQueryKey, data.me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSettled: () => {
      useSession.getState().clear();
      qc.clear();
    },
  });
}

export function useSwitchOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (organizationId: string) => api.post<AuthPayload>('/auth/switch-organization', { organizationId }),
    onSuccess: (data) => {
      qc.clear();
      applyAuth(data);
      qc.setQueryData(meQueryKey, data.me);
    },
  });
}

/**
 * Loads `me`. On first mount with no access token it attempts a silent refresh from the cookie.
 */
export function useMe(enabled = true) {
  const accessToken = useSession((s) => s.accessToken);
  return useQuery({
    queryKey: meQueryKey,
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      if (!accessToken) {
        const ok = await refreshAccessToken();
        if (!ok) return null;
      }
      const me = await api.get<MeDto>('/auth/me');
      useSession.getState().setMe(me);
      return me;
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: (input: ChangePasswordInput) => api.post<void>('/auth/change-password', input) });
}

export function useSessions() {
  return useQuery({ queryKey: ['auth', 'sessions'], queryFn: () => api.get<SessionDto[]>('/auth/sessions') });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });
}

export interface InvitationPreview {
  email: string;
  name: string;
  organizationName: string;
  roleName: string;
  requiresPassword: boolean;
  expiresAt: string;
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.get<InvitationPreview>(`/users/invitations/${token}`, undefined, { anonymous: true }),
    retry: false,
  });
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: (input: { token: string; name?: string; password?: string }) =>
      api.post<{ email: string }>('/users/invitations/accept', input, { anonymous: true }),
  });
}
