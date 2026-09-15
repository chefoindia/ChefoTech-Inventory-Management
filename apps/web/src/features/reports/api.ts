'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReportKey, ReportResult, REPORT_CATALOGUE } from '@pharmaos/shared';
import { api, API_URL, refreshAccessToken } from '@/lib/api-client';
import { useSession } from '@/stores/session';

export type ReportCatalogueItem = (typeof REPORT_CATALOGUE)[number];

export interface ReportParams {
  from?: string;
  to?: string;
  outletId?: string;
  categoryId?: string;
  productId?: string;
  limit?: number;
}

export function useReportCatalogue() {
  return useQuery({ queryKey: ['reports', 'catalogue'], queryFn: () => api.get<ReportCatalogueItem[]>('/reports/catalogue'), staleTime: Infinity });
}
export function useReport(key: ReportKey | null, params: ReportParams) {
  const outletId = useSession((s) => s.activeOutletId);
  return useQuery({ queryKey: ['reports', key, params, outletId], queryFn: () => api.get<ReportResult>(`/reports/${key}`, { ...params }), enabled: !!key, placeholderData: (p) => p });
}

/** Download a report/export as a file through an authenticated fetch. */
export async function downloadFile(path: string, fileName: string, retried = false): Promise<void> {
  const { accessToken, activeOutletId } = useSession.getState();
  const res = await fetch(`${API_URL}${path}`, { headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(activeOutletId ? { 'X-Outlet-Id': activeOutletId } : {}) }, credentials: 'include' });
  if (res.status === 401 && !retried && (await refreshAccessToken())) return downloadFile(path, fileName, true);
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message ?? `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cd = res.headers.get('content-disposition');
  const m = cd && /filename="([^"]+)"/.exec(cd);
  a.download = m ? m[1]! : fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function reportExportPath(key: ReportKey, params: ReportParams, format: 'csv' | 'xlsx') {
  const qs = Object.entries({ ...params, format }).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return `/reports/${key}?${qs}`;
}
