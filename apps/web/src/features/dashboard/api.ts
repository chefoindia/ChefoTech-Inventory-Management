'use client';

import { useQuery } from '@tanstack/react-query';
import type { DashboardSummary } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { useSession } from '@/stores/session';

export function useDashboard(params: { from?: string; to?: string; outletId?: string }) {
  const outletId = useSession((s) => s.activeOutletId);
  return useQuery({ queryKey: ['dashboard', params, outletId], queryFn: () => api.get<DashboardSummary>('/dashboard/summary', params), enabled: !!outletId, staleTime: 30_000, placeholderData: (p) => p });
}
