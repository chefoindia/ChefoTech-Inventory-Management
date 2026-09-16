'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubscriptionDto, PlanDto, PlanKey, SubscriptionInvoiceDto, CheckoutDto, CreateCheckoutInput, ConfirmCheckoutInput } from '@pharmaos/shared';
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

/* ---------------------------------------------------------------- billing */
export function useSubscriptionInvoices() {
  return useQuery({ queryKey: ['subscription', 'invoices'], queryFn: () => api.get<SubscriptionInvoiceDto[]>('/subscription/invoices') });
}
export function useCreateCheckout() {
  return useMutation({ mutationFn: (input: CreateCheckoutInput) => api.post<CheckoutDto>('/subscription/checkout', input) });
}
export function useConfirmCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmCheckoutInput) => api.post<SubscriptionInvoiceDto>('/subscription/checkout/confirm', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription'] });
      qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}
