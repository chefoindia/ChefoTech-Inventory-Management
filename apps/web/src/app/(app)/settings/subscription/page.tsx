'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Crown } from 'lucide-react';
import { FEATURE_KEYS, type FeatureKey, type PlanDto } from '@pharmaos/shared';
import { usePlans, useSubscription, useChangePlan } from '@/features/subscription/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const FEATURE_LABELS: Record<FeatureKey, string> = { multiOutlet: 'Multiple outlets', stockTransfers: 'Stock transfers', customRoles: 'Custom roles', customFields: 'Custom fields', templateDesigner: 'Document designer', emailInvoices: 'Email invoices', importExport: 'Import & export', advancedReports: 'Advanced reports', auditLog: 'Audit log', apiAccess: 'API access', prescriptions: 'Prescriptions', notificationsEmail: 'Email notifications' };

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit <= 0 || limit >= 1_000_000;
  const p = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex justify-between text-[13px]"><span>{label}</span><span className="tabular text-fg-subtle">{used}{unlimited ? '' : ` / ${limit}`}</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-surface-subtle"><div className={cn('h-1.5 rounded-full', p >= 90 ? 'bg-danger-600' : p >= 70 ? 'bg-warning-600' : 'bg-primary-600')} style={{ width: `${unlimited ? 8 : p}%` }} /></div>
    </div>
  );
}

export default function SubscriptionPage() {
  const sub = useSubscription();
  const plans = usePlans();
  const change = useChangePlan();
  const canManage = usePermission('organization.manage');
  const [target, setTarget] = useState<PlanDto | null>(null);
  if (sub.isPending || plans.isPending) return <Spinner />;
  if (sub.isError) return <ErrorState message={errorMessage(sub.error)} onRetry={() => sub.refetch()} />;
  const s = sub.data;
  return (
    <>
      <PageHeader title="Subscription" description="Plan, limits and usage for this organization." />
      {s.status === 'trialing' && s.trialEndsAt ? <Alert variant="info" className="mb-5" title={`Trial ends ${formatDate(s.trialEndsAt)}`}>Pick a plan before then; nothing is deleted, but limits apply to the plan you choose.</Alert> : null}
      {s.status === 'past_due' ? <Alert variant="danger" className="mb-5" title="Payment past due">Renew to keep creating invoices beyond the grace period.</Alert> : null}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle className="flex items-center gap-2"><Crown className="h-4 w-4 text-warning-600" /> {s.plan.name}</CardTitle><CardDescription>{s.plan.description}</CardDescription></div><StatusBadge status={s.status} /></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Usage label="Outlets" used={s.usage.outlets} limit={s.limits.outlets} />
            <Usage label="Users" used={s.usage.users} limit={s.limits.users} />
            <Usage label="Products" used={s.usage.products} limit={s.limits.products} />
            <Usage label="Invoices this month" used={s.usage.invoicesThisMonth} limit={s.limits.invoicesPerMonth} />
            <Usage label="Storage (MB)" used={s.usage.storageMb} limit={s.limits.storageMb} />
            <div className="text-[13px] text-fg-subtle">{s.currentPeriodEnd ? `Current period ends ${formatDate(s.currentPeriodEnd)}` : ''}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Included features</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {FEATURE_KEYS.map((f) => <li key={f} className={cn('flex items-center gap-2', !s.features.includes(f) && 'text-fg-faint line-through')}><Check className={cn('h-3.5 w-3.5', s.features.includes(f) ? 'text-success-600' : 'text-fg-faint')} /> {FEATURE_LABELS[f]}</li>)}
            </ul>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-[15px] font-semibold">Plans</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(plans.data ?? []).filter((p) => p.key !== 'trial').map((p) => {
          const current = p.key === s.plan.key;
          return (
            <Card key={p.key} className={cn('flex flex-col', current && 'border-primary-400 ring-1 ring-primary-200')}>
              <CardHeader><CardTitle className="flex items-center justify-between">{p.name}{current ? <Badge variant="primary">Current</Badge> : null}</CardTitle><CardDescription>{p.description}</CardDescription></CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="text-2xl font-semibold">{p.priceMinorPerMonth === null ? 'Custom' : money(p.priceMinorPerMonth)}<span className="text-sm font-normal text-fg-subtle">{p.priceMinorPerMonth === null ? '' : ' / month'}</span></div>
                <ul className="space-y-1 text-[13px] text-fg-muted">
                  <li>{p.limits.outlets >= 1_000_000 ? 'Unlimited' : p.limits.outlets} outlet{p.limits.outlets === 1 ? '' : 's'}</li>
                  <li>{p.limits.users >= 1_000_000 ? 'Unlimited' : p.limits.users} users</li>
                  <li>{p.limits.products >= 1_000_000 ? 'Unlimited' : p.limits.products.toLocaleString('en-IN')} products</li>
                  <li>{p.limits.invoicesPerMonth >= 1_000_000 ? 'Unlimited' : p.limits.invoicesPerMonth.toLocaleString('en-IN')} invoices / month</li>
                  <li>{p.limits.storageMb >= 1_000_000 ? 'Unlimited' : `${p.limits.storageMb} MB`} storage</li>
                </ul>
                <ul className="space-y-0.5 text-[12px] text-fg-subtle">{p.features.map((f) => <li key={f} className="flex items-center gap-1"><Check className="h-3 w-3 text-success-600" /> {FEATURE_LABELS[f]}</li>)}</ul>
              </CardContent>
              <CardFooter>{canManage ? <Button variant={current ? 'secondary' : 'primary'} size="sm" disabled={current || p.priceMinorPerMonth === null} onClick={() => setTarget(p)} className="w-full">{current ? 'Current plan' : p.priceMinorPerMonth === null ? 'Contact sales' : 'Switch to this plan'}</Button> : <span className="text-[12px] text-fg-subtle">Only owners can change the plan.</span>}</CardFooter>
            </Card>
          );
        })}
      </div>
      <ConfirmDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)} title={`Switch to ${target?.name}?`} description="Limits apply immediately. Payment collection is handled outside this screen; the plan change is recorded in the audit log." confirmLabel="Switch plan" loading={change.isPending} onConfirm={() => { if (!target) return; change.mutate(target.key, { onSuccess: () => { toast.success(`Now on ${target.name}`); setTarget(null); }, onError: (e) => toast.error(errorMessage(e)) }); }} />
    </>
  );
}
