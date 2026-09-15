'use client';

import Link from 'next/link';
import { Building2, Store, Users, ShieldCheck, ArrowRight, ClipboardList } from 'lucide-react';
import { useSession } from '@/stores/session';
import { useOutlets } from '@/features/outlets/api';
import { useMembers } from '@/features/users/api';
import { useAuditLogs } from '@/features/audit/api';
import { usePermission } from '@/features/auth/permissions';
import { PageHeader, SectionHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Stat } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton, EmptyState } from '@/components/ui/states';
import { buttonVariants } from '@/components/ui/button';
import { formatDate, relativeTime } from '@/lib/utils';

const ROADMAP = [
  { phase: 1, title: 'Products, customers & suppliers', detail: 'Catalog, units & conversions, barcodes, custom fields, Cloudinary attachments.' },
  { phase: 2, title: 'Inventory & batches', detail: 'Batch stock, movements ledger, adjustments with approval, expiry & low-stock.' },
  { phase: 3, title: 'Purchases & GRN', detail: 'Supplier invoices, partial receipts, schemes, supplier payments & ledger.' },
  { phase: 4, title: 'POS & credit', detail: 'Keyboard-first billing, FEFO batches, loose units, GST, split payments, Baki.' },
  { phase: 5, title: 'Returns & transfers', detail: 'Sales/purchase returns, outlet transfers, reconciliation, write-offs.' },
];

export default function DashboardPage() {
  const me = useSession((s) => s.me)!;
  const activeOutletId = useSession((s) => s.activeOutletId);
  const outlets = useOutlets();
  const canSeeUsers = usePermission('users.view');
  const canSeeAudit = usePermission('audit.view');
  const members = useMembers({ page: 1, pageSize: 1 });
  const audit = useAuditLogs({ page: 1, pageSize: 6 });
  const activeOutlet = me.outlets.find((o) => o.id === activeOutletId);

  const trialEnds = me.organization.subscription.trialEndsAt;

  return (
    <>
      <PageHeader
        title={`Good day, ${me.user.name.split(' ')[0]}`}
        description={activeOutlet ? `${me.organization.name} · ${activeOutlet.name}` : me.organization.name}
      />

      {me.organization.subscription.status === 'trialing' && trialEnds ? (
        <Alert variant="info" className="mb-5" title={`Trial plan · ends ${formatDate(trialEnds)}`}>
          Your organization is on the trial plan with up to {me.organization.subscription.limits.outlets} outlets and {me.organization.subscription.limits.users} users.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Outlets" value={outlets.isPending ? <Skeleton className="h-7 w-10" /> : (outlets.data?.length ?? 0)} hint="Active outlets you can access" />
        {canSeeUsers ? (
          <Stat label="Team members" value={members.isPending ? <Skeleton className="h-7 w-10" /> : (members.data?.meta.total ?? 0)} hint="Active and invited members" />
        ) : null}
        <Stat label="Your role" value={<span className="text-lg">{me.membership.role.name}</span>} hint={me.membership.isOwner ? 'Full access' : `${me.permissions.length} permissions`} />
        <Stat label="GST state" value={<span className="text-lg">{me.organization.tax.stateCode}</span>} hint={me.organization.tax.gstin || 'GSTIN not set yet'} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader title="Set up your pharmacy" description="Complete these before the operational modules arrive." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuickAction href="/settings/organization" icon={Building2} title="Organization profile" description="Legal name, GSTIN, address and business rules." />
            <QuickAction href="/settings/outlets" icon={Store} title="Outlets" description="Add branches, drug licence numbers and printer defaults." />
            <QuickAction href="/settings/users" icon={Users} title="Team" description="Invite staff and assign outlet access." permission="users.view" />
            <QuickAction href="/settings/roles" icon={ShieldCheck} title="Roles & permissions" description="Review what each role can do or create custom roles." permission="roles.view" />
          </div>

          <SectionHeader title="What ships next" description="Operational modules are built in phases; nothing here is a placeholder screen." />
          <Card>
            <ul className="divide-y divide-border">
              {ROADMAP.map((r) => (
                <li key={r.phase} className="flex items-start gap-3 px-5 py-3">
                  <Badge variant="neutral">Phase {r.phase}</Badge>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg">{r.title}</div>
                    <div className="text-[13px] text-fg-subtle">{r.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div>
          <SectionHeader title="Recent activity" />
          <Card>
            {!canSeeAudit ? (
              <EmptyState icon={ClipboardList} title="Activity hidden" description="Your role does not include audit access." className="py-10" />
            ) : audit.isPending ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : audit.data && audit.data.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {audit.data.items.map((log) => (
                  <li key={log.id} className="px-4 py-2.5">
                    <div className="truncate text-[13px] text-fg">{log.summary}</div>
                    <div className="text-[12px] text-fg-subtle">
                      {log.user?.name ?? 'System'} · {relativeTime(log.createdAt)}
                    </div>
                  </li>
                ))}
                <li className="px-4 py-2">
                  <Link href="/settings/audit" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-700 hover:underline">
                    View audit log <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            ) : (
              <EmptyState icon={ClipboardList} title="No activity yet" className="py-10" />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
  permission,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  permission?: string;
}) {
  const allowed = usePermission(permission ?? []);
  if (permission && !allowed) return null;
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-colors group-hover:border-primary-300">
        <CardHeader className="border-0">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 text-primary-700">
              <Icon className="h-4 w-4" />
            </span>
            <CardTitle>{title}</CardTitle>
          </div>
          <CardDescription className="mt-1">{description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <span className={buttonVariants({ variant: 'link', size: 'sm' })}>
            Open <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
