'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, BellRing } from 'lucide-react';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, NOTIFICATION_CATALOGUE, type NotificationRuleInput, type NotificationChannel } from '@pharmaos/shared';
import { useNotificationRules, useUpdateNotificationRules, useNotificationPreferences, useUpdateNotificationPreferences } from '@/features/notifications/api';
import { useRoles } from '@/features/roles/api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Checkbox, Switch } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/states';
import { Alert } from '@/components/ui/alert';

const CHANNEL_LABELS: Record<NotificationChannel, string> = { inApp: 'In-app', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', push: 'Push' };

export default function NotificationSettingsPage() {
  const canManage = usePermission('notifications.manage');
  return (
    <>
      <PageHeader title="Notification settings" description="Which events raise alerts, on which channels, to whom and at what thresholds." />
      <div className="space-y-5">
        {canManage ? <RulesCard /> : null}
        <PreferencesCard />
      </div>
    </>
  );
}

function RulesCard() {
  const rules = useNotificationRules();
  const roles = useRoles();
  const save = useUpdateNotificationRules();
  const features = useSession((s) => s.me?.organization.subscription);
  const [draft, setDraft] = useState<NotificationRuleInput[]>([]);
  useEffect(() => { if (rules.data) setDraft(rules.data.map((r) => ({ type: r.type, enabled: r.enabled, channels: r.channels, roleKeys: r.roleKeys, threshold: r.threshold }))); }, [rules.data]);
  const update = (type: string, patch: Partial<NotificationRuleInput>) => setDraft((d) => d.map((r) => (r.type === type ? { ...r, ...patch } : r)));
  const emailAllowed = features?.planKey !== 'starter';
  return (
    <Card>
      <CardHeader><CardTitle>Rules</CardTitle><CardDescription>Empty roles means everyone whose role has the relevant permission. Email requires a plan with email notifications; SMS/WhatsApp/push are recorded for future providers.</CardDescription></CardHeader>
      {rules.isPending ? <TableSkeleton rows={8} cols={4} /> : (
        <Table>
          <THead><TR><TH>Event</TH><TH>On</TH><TH>Channels</TH><TH>Threshold</TH><TH>Roles</TH></TR></THead>
          <TBody>
            {NOTIFICATION_TYPES.map((type) => {
              const r = draft.find((x) => x.type === type) ?? { type, enabled: true, channels: ['inApp' as const], roleKeys: [], threshold: undefined };
              const meta = NOTIFICATION_CATALOGUE[type];
              return (
                <TR key={type} className="align-top">
                  <TD><div className="font-medium">{meta.label}</div><div className="text-[12px] text-fg-subtle">{meta.description}</div></TD>
                  <TD><Switch checked={r.enabled} onCheckedChange={(v) => update(type, { enabled: v })} aria-label={`Enable ${meta.label}`} /></TD>
                  <TD><div className="flex flex-wrap gap-2">{NOTIFICATION_CHANNELS.map((c) => <label key={c} className="flex items-center gap-1 text-[12px]"><Checkbox checked={r.channels.includes(c)} disabled={c === 'email' && !emailAllowed} onChange={(e) => update(type, { channels: e.target.checked ? [...r.channels, c] : r.channels.filter((x) => x !== c) })} /> {CHANNEL_LABELS[c]}</label>)}</div></TD>
                  <TD>{meta.thresholdLabel ? <div className="flex items-center gap-2"><Input type="number" min={0} className="h-8 w-20" value={r.threshold ?? meta.defaultThreshold ?? 0} onChange={(e) => update(type, { threshold: Number(e.target.value) || 0 })} aria-label="Threshold" /><span className="text-[12px] text-fg-subtle">{meta.thresholdLabel}</span></div> : <span className="text-fg-faint">—</span>}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {(roles.data ?? []).map((role) => <label key={role.key} className={`cursor-pointer rounded-full border px-2 py-0.5 text-[12px] ${r.roleKeys.includes(role.key) ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-border text-fg-muted'}`}><input type="checkbox" className="sr-only" checked={r.roleKeys.includes(role.key)} onChange={(e) => update(type, { roleKeys: e.target.checked ? [...r.roleKeys, role.key] : r.roleKeys.filter((k) => k !== role.key) })} />{role.name}</label>)}
                      {!r.roleKeys.length ? <Badge variant="neutral">By permission: {meta.permission}</Badge> : null}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <CardFooter><Button loading={save.isPending} onClick={() => save.mutate(draft, { onSuccess: () => toast.success('Notification rules saved'), onError: (e) => toast.error(errorMessage(e)) })}><Save className="h-4 w-4" /> Save rules</Button></CardFooter>
    </Card>
  );
}

function PreferencesCard() {
  const prefs = useNotificationPreferences();
  const save = useUpdateNotificationPreferences();
  const [muted, setMuted] = useState<string[]>([]);
  const [digest, setDigest] = useState<'none' | 'daily'>('none');
  useEffect(() => { if (prefs.data) { setMuted(prefs.data.mutedTypes); setDigest(prefs.data.emailDigest); } }, [prefs.data]);
  return (
    <Card>
      <CardHeader><CardTitle>My preferences</CardTitle><CardDescription>Personal choices for your account; organization rules still decide what is generated.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="info"><BellRing className="hidden" />Muted types stay in the notification centre but are not counted as unread and are excluded from your email digest.</Alert>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {NOTIFICATION_TYPES.map((t) => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox checked={muted.includes(t)} onChange={(e) => setMuted((m) => (e.target.checked ? [...m, t] : m.filter((x) => x !== t)))} /> Mute {NOTIFICATION_CATALOGUE[t].label}</label>)}
        </div>
        <div className="flex items-center gap-3 text-sm"><span>Email digest</span><Select className="h-8 w-40" value={digest} onChange={(e) => setDigest(e.target.value as typeof digest)}><option value="none">Off</option><option value="daily">Daily summary</option></Select></div>
      </CardContent>
      <CardFooter><Button variant="secondary" loading={save.isPending} onClick={() => save.mutate({ mutedTypes: muted, emailDigest: digest }, { onSuccess: () => toast.success('Preferences saved'), onError: (e) => toast.error(errorMessage(e)) })}><Save className="h-4 w-4" /> Save preferences</Button></CardFooter>
    </Card>
  );
}
