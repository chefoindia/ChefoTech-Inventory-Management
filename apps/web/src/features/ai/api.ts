'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiSettingsDto, AiSettingsPatch, AiChatInput, AiChatReply, AiExtractedInvoice, AiExtractedPrescription, AttachmentRef } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { useSession } from '@/stores/session';
import { hasPermission } from '@/stores/session';

export const aiSettingsKey = ['ai', 'settings'] as const;

/** Settings are readable by anyone allowed to use AI; the key itself is never included. */
export function useAiSettings() {
  const me = useSession((s) => s.me);
  const allowed = hasPermission(me, 'ai.use') || hasPermission(me, 'ai.manage');
  return useQuery({ queryKey: aiSettingsKey, queryFn: () => api.get<AiSettingsDto>('/ai/settings'), enabled: !!me && allowed, staleTime: 60_000 });
}

/** True when the assistant can be shown: permission + connected + feature on. */
export function useAiAvailable(feature: AiSettingsDto['features'][number] = 'assistant') {
  const q = useAiSettings();
  const me = useSession((s) => s.me);
  const ok = !!q.data && q.data.enabled && q.data.connected && q.data.features.includes(feature) && hasPermission(me, 'ai.use');
  return { available: ok, settings: q.data, loading: q.isPending && q.fetchStatus !== 'idle' };
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['ai'] });
}
export function useUpdateAiSettings() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (patch: AiSettingsPatch) => api.patch<AiSettingsDto>('/ai/settings', patch), onSuccess: inv });
}
export function useSetAiKey() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (apiKey: string) => api.post<AiSettingsDto>('/ai/key', { apiKey }), onSuccess: inv });
}
export function useRemoveAiKey() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: () => api.delete<AiSettingsDto>('/ai/key'), onSuccess: inv });
}
export function useTestAi() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: () => api.post<AiSettingsDto>('/ai/test'), onSuccess: inv });
}

export function useAiChat() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (input: AiChatInput) => api.post<AiChatReply>('/ai/chat', input), onSettled: inv });
}
export function useExtractInvoice() {
  return useMutation({ mutationFn: (input: { attachment: AttachmentRef; supplierId?: string }) => api.post<AiExtractedInvoice>('/ai/extract/invoice', input) });
}
export function useExtractPrescription() {
  return useMutation({ mutationFn: (input: { attachment: AttachmentRef }) => api.post<AiExtractedPrescription>('/ai/extract/prescription', input) });
}
