'use client';

import { useState } from 'react';
import { ClipboardList, ChevronDown, ChevronRight } from 'lucide-react';
import type { AuditLogDto } from '@pharmaos/shared';
import { useAuditLogs } from '@/features/audit/api';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD, Pagination } from '@/components/ui/table';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const ENTITY_TYPES = ['', 'Organization', 'Outlet', 'User', 'Membership', 'Invitation', 'Role', 'Session'];

function DiffView({ log }: { log: AuditLogDto }) {
  const before = (log.before ?? {}) as Record<string, unknown>;
  const after = (log.after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  if (keys.length === 0) return <div className="text-[13px] text-fg-subtle">No field changes recorded.</div>;
  return (
    <table className="w-full text-[13px]">
      <thead className="text-left text-[12px] uppercase tracking-wide text-fg-subtle">
        <tr>
          <th className="py-1 pr-4 font-medium">Field</th>
          <th className="py-1 pr-4 font-medium">Before</th>
          <th className="py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {keys.map((k) => (
          <tr key={k} className="align-top">
            <td className="py-1 pr-4 font-medium text-fg">{k}</td>
            <td className="py-1 pr-4 font-mono text-[12px] text-fg-muted">{stringify(before[k])}</td>
            <td className="py-1 font-mono text-[12px] text-fg">{stringify(after[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function stringify(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const logs = useAuditLogs({
    page,
    entityType: entityType || undefined,
    action: action || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
  });

  return (
    <>
      <PageHeader title="Audit log" description="Who did what, when, and what changed. Entries are append-only." />

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
          Entity
          <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="h-8 w-40">
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t || 'All'}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
          Action
          <Input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="e.g. outlet.updated" className="h-8 w-48" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
          From
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-8" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
          To
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-8" />
        </label>
        <Button variant="ghost" size="sm" onClick={() => { setEntityType(''); setAction(''); setFrom(''); setTo(''); setPage(1); }}>
          Clear
        </Button>
      </Card>

      <Card>
        {logs.isPending ? (
          <TableSkeleton />
        ) : logs.isError ? (
          <ErrorState message={errorMessage(logs.error)} onRetry={() => logs.refetch()} />
        ) : logs.data.items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No audit entries" description="Try widening the filters." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH className="w-8"><span className="sr-only">Details</span></TH>
                  <TH>When</TH>
                  <TH>User</TH>
                  <TH>Action</TH>
                  <TH>Summary</TH>
                </TR>
              </THead>
              <TBody>
                {logs.data.items.map((log) => {
                  const open = expanded === log.id;
                  return (
                    <LogRows key={log.id} log={log} open={open} onToggle={() => setExpanded(open ? null : log.id)} />
                  );
                })}
              </TBody>
            </Table>
            <Pagination meta={logs.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

function LogRows({ log, open, onToggle }: { log: AuditLogDto; open: boolean; onToggle: () => void }) {
  return (
    <>
      <TR interactive onClick={onToggle} aria-expanded={open}>
        <TD>{open ? <ChevronDown className="h-4 w-4 text-fg-subtle" /> : <ChevronRight className="h-4 w-4 text-fg-subtle" />}</TD>
        <TD className="whitespace-nowrap text-fg-muted">{formatDateTime(log.createdAt)}</TD>
        <TD>{log.user ? <span title={log.user.email}>{log.user.name}</span> : <span className="text-fg-subtle">System</span>}</TD>
        <TD>
          <Badge variant="neutral">{log.action}</Badge>
        </TD>
        <TD className="max-w-[420px] truncate">{log.summary}</TD>
      </TR>
      {open ? (
        <tr className="bg-surface-muted">
          <td colSpan={5} className="px-6 py-3">
            <div className="mb-2 text-[12px] text-fg-subtle">
              {log.entityType}
              {log.entityId ? ` · ${log.entityId}` : ''}
              {log.ip ? ` · IP ${log.ip}` : ''}
            </div>
            <DiffView log={log} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
