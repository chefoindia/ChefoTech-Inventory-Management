'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubscriptionDto, PlanDto, PlanKey } from '@pharmaos/shared';
import { api } from '@/lib/api-client';
import { meQueryKey } from '@/features/auth/api';

export function usePlans() {
  return useQuery({ queryKey: ['subscription', 'plans'], queryFn: () => api.get<PlanDto[]>('/subscription/plans', undefined, { anonymous: true }), staleTime: Infinity });
}
export function useSubscription() {
  return useQuery({ queryKey: ['subscription'], queryFn: () => api.get<SubscriptionDto>('/subscription') });
}
export function useChangePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planKey: PlanKey) => api.post<SubscriptionDto>('/subscription/change-plan', { planKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription'] });
      qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}
