'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bell, CheckCheck, RefreshCw, Settings, AlertTriangle, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { NOTIFICATION_CATALOGUE, NOTIFICATION_TYPES } from '@pharmaos/shared';
import { useNotifications, useMarkRead, useMarkAllRead, useRunScans } from '@/features/notifications/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { relativeTime, cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select, Checkbox } from '@/components/ui/input';
import { Pagination } from '@/components/ui/table';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/states';

const ICONS = { info: Info, warning: AlertTriangle, danger: AlertCircle, success: CheckCircle2 } as const;
const TONES = { info: 'bg-info-50 text-info-700', warning: 'bg-warning-50 text-warning-700', danger: 'bg-danger-50 text-danger-700', success: 'bg-success-50 text-success-700' } as const;

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState('');
  const list = useNotifications({ page, unreadOnly, type: type || undefined });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const scan = useRunScans();
  const canManage = usePermission('notifications.manage');
  return (
    <>
      <PageHeader title="Notifications" description={list.data ? `${list.data.unread} unread` : 'Alerts about stock, expiry, credit, approvals and system events.'} actions={<>
        {canManage ? <Button variant="ghost" size="sm" loading={scan.isPending} onClick={() => scan.mutate(undefined, { onSuccess: (r) => toast.success(`Scan complete · ${Object.values(r).reduce((s, n) => s + n, 0)} new`), onError: (e) => toast.error(errorMessage(e)) })}><RefreshCw className="h-3.5 w-3.5" /> Run checks now</Button> : null}
        <Button variant="secondary" size="sm" loading={markAll.isPending} disabled={!list.data?.unread} onClick={() => markAll.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}><CheckCheck className="h-3.5 w-3.5" /> Mark all read</Button>
        {canManage ? <Link href="/settings/notifications" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Settings className="h-3.5 w-3.5" /> Rules</Link> : null}
      </>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <label className="flex items-center gap-2 text-[13px] text-fg-muted"><Checkbox checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} /> Unread only</label>
          <Select className="h-8 w-56" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type"><option value="">All types</option>{NOTIFICATION_TYPES.map((t) => <option key={t} value={t}>{NOTIFICATION_CATALOGUE[t].label}</option>)}</Select>
        </div>
        {list.isPending ? <TableSkeleton rows={6} cols={2} /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : list.data.items.length === 0 ? <EmptyState icon={Bell} title={unreadOnly ? 'All caught up' : 'No notifications yet'} description="Checks run automatically in the background; results land here and by email where enabled." /> : (
          <>
            <ul className="divide-y divide-border">
              {list.data.items.map((n) => {
                const Icon = ICONS[n.severity];
                const body = (
                  <div className={cn('flex items-start gap-3 px-4 py-3', !n.readAt && 'bg-primary-50/40')}>
                    <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', TONES[n.severity])}><Icon className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm', !n.readAt && 'font-medium')}>{n.title}</span>
                      <span className="block text-[13px] text-fg-muted">{n.body}</span>
                      <span className="block text-[12px] text-fg-subtle">{NOTIFICATION_CATALOGUE[n.type]?.label ?? n.type} · {relativeTime(n.createdAt)}</span>
                    </span>
                    {!n.readAt ? <Button variant="ghost" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); markRead.mutate(n.id); }}>Mark read</Button> : null}
                  </div>
                );
                return <li key={n.id}>{n.href ? <Link href={n.href} onClick={() => { if (!n.readAt) markRead.mutate(n.id); }} className="block hover:bg-surface-muted">{body}</Link> : body}</li>;
              })}
            </ul>
            <Pagination meta={list.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
