'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, MoreHorizontal, Users, MailWarning, Search } from 'lucide-react';
import type { z } from 'zod';
import { inviteUserSchema, updateMembershipSchema, type InviteUserInput, type UpdateMembershipInput, type MembershipDto } from '@pharmaos/shared';
import { useMembers, useInvitations, useInviteUser, useRevokeInvitation, useUpdateMembership } from '@/features/users/api';
import { useRoles } from '@/features/roles/api';
import { useOutlets } from '@/features/outlets/api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { formatDate, initials, relativeTime } from '@/lib/utils';
import { PageHeader, SectionHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD, Pagination } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, Select, Checkbox, Label } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Alert } from '@/components/ui/alert';

function OutletAccessField({
  value,
  onChange,
  error,
}: {
  value: { all: boolean; outletIds: string[] };
  onChange: (v: { all: boolean; outletIds: string[] }) => void;
  error?: string;
}) {
  const outlets = useOutlets();
  return (
    <div className="space-y-2">
      <Label>Outlet access</Label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={value.all} onChange={(e) => onChange({ all: e.target.checked, outletIds: e.target.checked ? [] : value.outletIds })} />
        All outlets (including ones created later)
      </label>
      {!value.all ? (
        <div className="grid grid-cols-1 gap-1 rounded-[var(--radius-control)] border border-border p-3 sm:grid-cols-2">
          {outlets.data?.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.outletIds.includes(o.id)}
                onChange={(e) =>
                  onChange({ all: false, outletIds: e.target.checked ? [...value.outletIds, o.id] : value.outletIds.filter((id) => id !== o.id) })
                }
              />
              {o.name} <span className="text-[12px] text-fg-subtle">{o.code}</span>
            </label>
          ))}
          {outlets.data && outlets.data.length === 0 ? <span className="text-[13px] text-fg-subtle">No outlets yet.</span> : null}
        </div>
      ) : null}
      {error ? <p className="text-[12px] text-danger-600">{error}</p> : null}
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const roles = useRoles();
  const invite = useInviteUser();
  const form = useForm<z.input<typeof inviteUserSchema>, unknown, InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { email: '', name: '', roleId: '', outletAccess: { all: true, outletIds: [] } },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    invite.mutate(values, {
      onSuccess: (res) => {
        if (res.emailStatus === 'sent') toast.success(`Invitation sent to ${res.email}`);
        else toast.warning(`Invitation created, but the email could not be sent. You can resend it from the pending list.`);
        onOpenChange(false);
        form.reset();
      },
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err));
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !invite.isPending && onOpenChange(o)}>
      <DialogContent title="Invite a team member" description="They receive an email link valid for 7 days.">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormGrid>
            <FormField info="The staff member name as it should appear in the audit trail and on the bills they create." label="Name" htmlFor="name" error={errors.name?.message} required>
              <Input autoFocus {...form.register('name')} />
            </FormField>
            <FormField info="Where their invitation is sent and the address they sign in with. It must be their own, because every action is recorded against it." label="Email" htmlFor="email" error={errors.email?.message} required>
              <Input type="email" {...form.register('email')} />
            </FormField>
          </FormGrid>
          <FormField info="What they are allowed to do. A cashier can bill, a pharmacist can dispense schedule medicines, a manager can see cost and profit." label="Role" htmlFor="roleId" error={errors.roleId?.message} required>
            <Select {...form.register('roleId')}>
              <option value="">Select a role</option>
              {roles.data?.filter((r) => r.key !== 'owner').map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.isSystem ? '' : ' (custom)'}
                </option>
              ))}
            </Select>
          </FormField>
          <Controller
            control={form.control}
            name="outletAccess"
            render={({ field }) => <OutletAccessField value={{ all: field.value?.all ?? false, outletIds: field.value?.outletIds ?? [] }} onChange={field.onChange} error={errors.outletAccess?.message} />}
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={invite.isPending}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, onOpenChange }: { member: MembershipDto | null; onOpenChange: (o: boolean) => void }) {
  const roles = useRoles();
  const update = useUpdateMembership();
  const form = useForm<z.input<typeof updateMembershipSchema>, unknown, UpdateMembershipInput>({
    resolver: zodResolver(updateMembershipSchema),
    values: member ? { roleId: member.role.id, outletAccess: member.outletAccess, status: member.status } : undefined,
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    if (!member) return;
    update.mutate(
      { id: member.id, input: values },
      {
        onSuccess: () => {
          toast.success('Member updated');
          onOpenChange(false);
        },
        onError: (err) => {
          if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err));
        },
      },
    );
  });

  return (
    <Dialog open={!!member} onOpenChange={(o) => !update.isPending && onOpenChange(o)}>
      <DialogContent title={member ? `Edit ${member.user.name}` : 'Edit member'} description={member?.user.email}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormGrid>
            <FormField info="What they are allowed to do. A cashier can bill, a pharmacist can dispense schedule medicines, a manager can see cost and profit." label="Role" htmlFor="roleId" error={errors.roleId?.message}>
              <Select {...form.register('roleId')}>
                {roles.data?.filter((r) => r.key !== 'owner').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField info="Whether this member can still sign in. Suspend instead of deleting, so their past sales stay attributable." label="Status" htmlFor="status" error={errors.status?.message} hint="Suspending signs the member out immediately.">
              <Select {...form.register('status')}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </Select>
            </FormField>
          </FormGrid>
          <Controller
            control={form.control}
            name="outletAccess"
            render={({ field }) => <OutletAccessField value={{ all: field.value?.all ?? false, outletIds: field.value?.outletIds ?? [] }} onChange={field.onChange} />}
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const members = useMembers({ page, q: q || undefined });
  const invitations = useInvitations();
  const revoke = useRevokeInvitation();
  const canManage = usePermission('users.manage');
  const me = useSession((s) => s.me)!;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipDto | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const limit = me.organization.subscription.limits.users;
  const used = (members.data?.meta.total ?? 0) + (invitations.data?.length ?? 0);

  return (
    <>
      <PageHeader
        title="Users"
        description={`${used} of ${limit} seats used on your plan.`}
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)} disabled={used >= limit}>
              <Plus className="h-4 w-4" /> Invite member
            </Button>
          ) : null
        }
      />

      {invitations.data && invitations.data.length > 0 ? (
        <>
          <SectionHeader title="Pending invitations" />
          <Card className="mb-6">
            <Table>
              <THead>
                <TR>
                  <TH>Invitee</TH>
                  <TH>Role</TH>
                  <TH>Email</TH>
                  <TH>Expires</TH>
                  {canManage ? <TH className="w-12"><span className="sr-only">Actions</span></TH> : null}
                </TR>
              </THead>
              <TBody>
                {invitations.data.map((inv) => (
                  <TR key={inv.id}>
                    <TD>
                      <div className="font-medium">{inv.name}</div>
                      <div className="text-[12px] text-fg-subtle">{inv.email}</div>
                    </TD>
                    <TD>{inv.roleName}</TD>
                    <TD>
                      {inv.emailStatus === 'failed' ? (
                        <Badge variant="danger"><MailWarning className="h-3 w-3" /> Email failed</Badge>
                      ) : (
                        <StatusBadge status={inv.emailStatus} />
                      )}
                    </TD>
                    <TD>{formatDate(inv.expiresAt)}</TD>
                    {canManage ? (
                      <TD>
                        <Button variant="ghost" size="sm" onClick={() => setRevoking(inv.id)}>
                          Revoke
                        </Button>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      ) : null}

      <SectionHeader
        title="Members"
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-faint" />
            <Input placeholder="Search name or email" className="h-9 w-64 pl-8" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search members" />
          </div>
        }
      />
      <Card>
        {members.isPending ? (
          <TableSkeleton />
        ) : members.isError ? (
          <ErrorState message={errorMessage(members.error)} onRetry={() => members.refetch()} />
        ) : members.data.items.length === 0 ? (
          <EmptyState icon={Users} title={q ? 'No members match' : 'No members yet'} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Member</TH>
                  <TH>Role</TH>
                  <TH>Outlet access</TH>
                  <TH>Status</TH>
                  <TH>Last sign-in</TH>
                  {canManage ? <TH className="w-12"><span className="sr-only">Actions</span></TH> : null}
                </TR>
              </THead>
              <TBody>
                {members.data.items.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[12px] font-semibold text-primary-800">{initials(m.user.name)}</span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {m.user.name}
                            {m.user.id === me.user.id ? <span className="ml-1 text-[12px] text-fg-subtle">(you)</span> : null}
                          </div>
                          <div className="truncate text-[12px] text-fg-subtle">{m.user.email}</div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        {m.role.name}
                        {m.isOwner ? <Badge variant="primary">Owner</Badge> : null}
                      </div>
                    </TD>
                    <TD>{m.outletAccess.all || m.isOwner ? 'All outlets' : `${m.outletAccess.outletIds.length} outlet(s)`}</TD>
                    <TD><StatusBadge status={m.status} /></TD>
                    <TD className="text-fg-subtle">{m.user.lastLoginAt ? relativeTime(m.user.lastLoginAt) : 'Never'}</TD>
                    {canManage ? (
                      <TD>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.user.name}`} disabled={m.isOwner || m.user.id === me.user.id}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(m)}>Edit access</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={members.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      {!canManage ? <Alert variant="info" className="mt-4">You can view the team but need the “Invite, edit & deactivate users” permission to make changes.</Alert> : null}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditMemberDialog member={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke invitation?"
        description="The link in the email stops working immediately."
        confirmLabel="Revoke"
        destructive
        loading={revoke.isPending}
        onConfirm={() => {
          if (!revoking) return;
          revoke.mutate(revoking, {
            onSuccess: () => { toast.success('Invitation revoked'); setRevoking(null); },
            onError: (err) => toast.error(errorMessage(err)),
          });
        }}
      />
    </>
  );
}
