'use client';

import { useQuery } from '@tanstack/react-query';
import type { AuditLogDto } from '@pharmaos/shared';
import { api } from '@/lib/api-client';

export interface AuditFilters {
  page: number;
  pageSize?: number;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
}

export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => api.getPaged<AuditLogDto>('/audit-logs', { ...filters, pageSize: filters.pageSize ?? 25 }),
    placeholderData: (prev) => prev,
  });
}
