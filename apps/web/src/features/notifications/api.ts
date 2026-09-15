'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto, NotificationRuleDto, NotificationRuleInput } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { useSession } from '@/stores/session';

export function useNotifications(params: { page: number; unreadOnly?: boolean; type?: string }) {
  const me = useSession((s) => s.me);
  return useQuery({
    queryKey: ['notifications', 'list', params, me?.user.id],
    queryFn: async () => {
      const res = await api.getPaged<NotificationDto>('/notifications', { ...params, pageSize: 25 });
      return { ...res, unread: (res.meta as unknown as { unread?: number }).unread ?? 0 };
    },
    enabled: !!me,
    placeholderData: (p) => p,
  });
}
export function useUnreadCount() {
  const me = useSession((s) => s.me);
  return useQuery({ queryKey: ['notifications', 'unread', me?.user.id], queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'), enabled: !!me, refetchInterval: 60_000 });
}
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
}
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
}
export function useNotificationRules() {
  return useQuery({ queryKey: ['notifications', 'rules'], queryFn: () => api.get<NotificationRuleDto[]>('/notifications/rules') });
}
export function useUpdateNotificationRules() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (rules: NotificationRuleInput[]) => api.put<NotificationRuleDto[]>('/notifications/rules', { rules }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', 'rules'] }) });
}
export function useNotificationPreferences() {
  return useQuery({ queryKey: ['notifications', 'preferences'], queryFn: () => api.get<{ mutedTypes: string[]; emailDigest: 'none' | 'daily' }>('/notifications/preferences') });
}
export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { mutedTypes: string[]; emailDigest: 'none' | 'daily' }) => api.put('/notifications/preferences', input), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', 'preferences'] }) });
}
export function useRunScans() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.post<Record<string, number>>('/notifications/scan'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
}
