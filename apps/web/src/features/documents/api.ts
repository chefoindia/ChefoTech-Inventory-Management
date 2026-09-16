'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TemplateDto, TemplateLayout, DocumentTemplateType, GeneratedDocumentDto, CreateTemplateInput, BindingGroup, ShareLinkDto } from '@pharmaos/shared';

type PageDimensionsMap = Record<string, { width: number; height: number; continuous?: boolean }>;
import { api, API_URL, refreshAccessToken } from '@/lib/api-client';
import { useSession } from '@/stores/session';

/** Authenticated fetch of a PDF as a Blob (the API needs the bearer token, so <a href> is not enough). */
export async function fetchPdfBlob(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown } = {}, retried = false): Promise<Blob> {
  const { accessToken, activeOutletId } = useSession.getState();
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(activeOutletId ? { 'X-Outlet-Id': activeOutletId } : {}), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
  });
  if (res.status === 401 && !retried && (await refreshAccessToken())) return fetchPdfBlob(path, opts, true);
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message ?? `Could not load document (${res.status})`);
  }
  return res.blob();
}

export function documentPath(type: DocumentTemplateType, refId: string, query: Record<string, string | undefined> = {}) {
  const qs = Object.entries(query).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
  return `/documents/${type}/${refId}${qs ? `?${qs}` : ''}`;
}

/** Opens a document in a new tab (blob URL) or triggers print. */
export async function openDocument(type: DocumentTemplateType, refId: string, opts: { print?: boolean; download?: boolean; templateId?: string; from?: string; to?: string } = {}) {
  const blob = await fetchPdfBlob(documentPath(type, refId, { templateId: opts.templateId, from: opts.from, to: opts.to }));
  const url = URL.createObjectURL(blob);
  if (opts.download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${refId}.pdf`;
    a.click();
  } else if (opts.print) {
    const w = window.open(url, '_blank', 'noopener');
    w?.addEventListener('load', () => w.print());
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function useEmailDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, refId, to, message, templateId }: { type: DocumentTemplateType; refId: string; to?: string; message?: string; templateId?: string }) => api.post<{ to: string; status: string }>(`/documents/${type}/${refId}/email`, { to, message, templateId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
  });
}
export function useDocumentHistory(refType: string, refId: string | null) {
  return useQuery({ queryKey: ['documents', 'history', refType, refId], queryFn: () => api.get<GeneratedDocumentDto[]>(`/documents/history/${refType}/${refId}`), enabled: !!refId });
}

/* templates */
export interface TemplateCatalogue {
  documentTypes: { key: DocumentTemplateType; label: string }[];
  pageSizes: PageDimensionsMap;
  bindings: BindingGroup[];
  tableColumns: Record<string, { key: string; label: string; format: string }[]>;
}
export function useTemplateCatalogue() {
  return useQuery({ queryKey: ['templates', 'catalogue'], queryFn: () => api.get<TemplateCatalogue>('/templates/catalogue'), staleTime: Infinity });
}
export function useTemplates(documentType?: DocumentTemplateType) {
  return useQuery({ queryKey: ['templates', 'list', documentType ?? 'all'], queryFn: () => api.get<TemplateDto[]>('/templates', { documentType }) });
}
export function useTemplate(id: string | null) {
  return useQuery({ queryKey: ['templates', 'detail', id], queryFn: () => api.get<TemplateDto>(`/templates/${id}`), enabled: !!id });
}
function useInvalidateTemplates() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['templates'] });
}
export function useCreateTemplate() {
  const inv = useInvalidateTemplates();
  return useMutation({ mutationFn: (input: CreateTemplateInput) => api.post<TemplateDto>('/templates', input), onSuccess: inv });
}
export function useSaveTemplateVersion() {
  const inv = useInvalidateTemplates();
  return useMutation({ mutationFn: ({ id, layout, note }: { id: string; layout: TemplateLayout; note?: string }) => api.post<TemplateDto>(`/templates/${id}/versions`, { layout, note }), onSuccess: inv });
}
export function useRestoreTemplateVersion() {
  const inv = useInvalidateTemplates();
  return useMutation({ mutationFn: ({ id, version }: { id: string; version: number }) => api.post<TemplateDto>(`/templates/${id}/versions/${version}/restore`), onSuccess: inv });
}
export function useRenameTemplate() {
  const inv = useInvalidateTemplates();
  return useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.patch<TemplateDto>(`/templates/${id}`, { name }), onSuccess: inv });
}
export function useSetDefaultTemplate() {
  const inv = useInvalidateTemplates();
  return useMutation({ mutationFn: (id: string) => api.post<TemplateDto>(`/templates/${id}/default`), onSuccess: inv });
}
export function useArchiveTemplate() {
  const inv = useInvalidateTemplates();
  return useMutation({ mutationFn: (id: string) => api.delete(`/templates/${id}`), onSuccess: inv });
}
export async function previewTemplate(type: DocumentTemplateType, layout: TemplateLayout, refId?: string): Promise<Blob> {
  return fetchPdfBlob(`/templates/preview/${type}`, { method: 'POST', body: { layout, refId } });
}

/** Signed public link for WhatsApp/SMS sharing (7 days). */
export function useShareLink() {
  return useMutation({ mutationFn: ({ type, refId, phone, label, from, to }: { type: DocumentTemplateType; refId: string; phone?: string; label?: string; from?: string; to?: string }) => api.post<ShareLinkDto>(`/documents/${type}/${refId}/share-link`, { phone, label, from, to }) });
}
