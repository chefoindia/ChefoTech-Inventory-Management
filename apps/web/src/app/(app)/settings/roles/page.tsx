'use client';

import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, ShieldCheck, Lock } from 'lucide-react';
import type { z } from 'zod';
import { createRoleSchema, type CreateRoleInput, type RoleDto, type PermissionGroup } from '@pharmaos/shared';
import { useRoles, usePermissionCatalog, useCreateRole, useUpdateRole, useDeleteRole } from '@/features/roles/api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { Alert } from '@/components/ui/alert';

function PermissionMatrix({
  groups,
  value,
  onChange,
  disabled,
  grantable,
}: {
  groups: PermissionGroup[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Permissions the current user may grant (null = all). */
  grantable: Set<string> | null;
}) {
  const set = new Set(value);
  const toggle = (key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    onChange([...next]);
  };
  const toggleGroup = (g: PermissionGroup, on: boolean) => {
    const next = new Set(set);
    for (const p of g.permissions) {
      if (grantable && !grantable.has(p.key)) continue;
      if (on) next.add(p.key);
      else next.delete(p.key);
    }
    onChange([...next]);
  };

  return (
    <div className="divide-y divide-border rounded-[var(--radius-card)] border border-border">
      {groups.map((g) => {
        const allowedKeys = g.permissions.filter((p) => !grantable || grantable.has(p.key)).map((p) => p.key);
        const allOn = allowedKeys.length > 0 && allowedKeys.every((k) => set.has(k));
        const someOn = allowedKeys.some((k) => set.has(k));
        return (
          <div key={g.module} className="px-4 py-3">
            <label className="flex items-center gap-2 text-sm font-medium text-fg">
              <Checkbox
                checked={allOn}
                ref={(el) => {
                  if (el) el.indeterminate = !allOn && someOn;
                }}
                disabled={disabled || allowedKeys.length === 0}
                onChange={(e) => toggleGroup(g, e.target.checked)}
              />
              {g.label}
            </label>
            <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 pl-6 sm:grid-cols-2 lg:grid-cols-3">
              {g.permissions.map((p) => {
                const locked = grantable ? !grantable.has(p.key) : false;
                const control = (
                  <label key={p.key} className={cn('flex items-start gap-2 text-[13px]', locked ? 'text-fg-faint' : 'text-fg-muted')}>
                    <Checkbox className="mt-0.5" checked={set.has(p.key)} disabled={disabled || locked} onChange={(e) => toggle(p.key, e.target.checked)} />
                    <span>
                      {p.label}
                      {p.sensitive ? <span className="ml-1 text-[11px] uppercase tracking-wide text-warning-700">sensitive</span> : null}
                      {locked ? <Lock className="ml-1 inline h-3 w-3" aria-label="You cannot grant this permission" /> : null}
                    </span>
                  </label>
                );
                return locked ? (
                  <Tooltip key={p.key} content="You can only grant permissions you hold yourself.">
                    {control}
                  </Tooltip>
                ) : (
                  control
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoleDialog({ role, open, onOpenChange, groups }: { role: RoleDto | null; open: boolean; onOpenChange: (o: boolean) => void; groups: PermissionGroup[] }) {
  const create = useCreateRole();
  const update = useUpdateRole();
  const me = useSession((s) => s.me)!;
  const grantable = me.membership.isOwner ? null : new Set(me.permissions);
  const form = useForm<z.input<typeof createRoleSchema>, unknown, CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    values: role ? { name: role.name, description: role.description, permissions: role.permissions } : { name: '', description: '', permissions: [] },
  });
  const errors = form.formState.errors;
  const pending = create.isPending || update.isPending;
  const isOwnerRole = role?.key === 'owner';

  const onSubmit = form.handleSubmit((values) => {
    const done = () => {
      toast.success(role ? 'Role updated' : 'Role created');
      onOpenChange(false);
    };
    const fail = (err: unknown) => {
      if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err));
    };
    if (role) update.mutate({ id: role.id, input: role.isSystem ? { description: values.description, permissions: values.permissions } : values }, { onSuccess: done, onError: fail });
    else create.mutate(values, { onSuccess: done, onError: fail });
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent title={role ? role.name : 'New custom role'} description={role?.isSystem ? 'System role: the name is fixed, permissions can be tuned.' : 'Choose exactly what this role can do.'} size="xl">
        {isOwnerRole ? <Alert variant="info" className="mb-4">The Owner role always has every permission and cannot be edited.</Alert> : null}
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Role name" htmlFor="name" error={errors.name?.message} required>
              <Input autoFocus disabled={!!role?.isSystem} {...form.register('name')} />
            </FormField>
            <FormField label="Description" htmlFor="description" error={errors.description?.message}>
              <Textarea rows={1} className="min-h-[36px]" disabled={isOwnerRole} {...form.register('description')} />
            </FormField>
          </div>
          <Controller
            control={form.control}
            name="permissions"
            render={({ field }) => <PermissionMatrix groups={groups} value={field.value} onChange={field.onChange} disabled={isOwnerRole} grantable={grantable} />}
          />
          {errors.permissions?.message ? <p className="text-[12px] text-danger-600">{errors.permissions.message}</p> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            {!isOwnerRole ? (
              <Button type="submit" loading={pending}>
                {role ? 'Save changes' : 'Create role'}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function RolesPage() {
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const remove = useDeleteRole();
  const canManage = usePermission('roles.manage');
  const [editing, setEditing] = useState<RoleDto | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<RoleDto | null>(null);

  const total = useMemo(() => catalog.data?.reduce((n, g) => n + g.permissions.length, 0) ?? 0, [catalog.data]);

  if (roles.isPending || catalog.isPending) return <Spinner />;
  if (roles.isError || catalog.isError || !roles.data || !catalog.data) {
    return <ErrorState message={errorMessage(roles.error ?? catalog.error)} onRetry={() => { roles.refetch(); catalog.refetch(); }} />;
  }

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description={`${roles.data.length} roles · ${total} permissions. Permissions are enforced by the server on every request.`}
        actions={
          canManage ? (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> New role
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.data.map((r) => (
          <Card key={r.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 text-primary-700">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-medium text-fg">{r.name}</div>
                  <div className="text-[12px] text-fg-subtle">{r.memberCount ?? 0} member(s)</div>
                </div>
              </div>
              <Badge variant={r.isSystem ? 'neutral' : 'primary'}>{r.isSystem ? 'System' : 'Custom'}</Badge>
            </div>
            <p className="mt-3 flex-1 text-[13px] text-fg-muted">{r.description || 'No description.'}</p>
            <div className="mt-3 text-[12px] text-fg-subtle">
              {r.key === 'owner' ? 'All permissions' : `${r.permissions.length} of ${total} permissions`}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setEditing(r); setOpen(true); }}>
                {canManage && r.key !== 'owner' ? 'Edit' : 'View'}
              </Button>
              {canManage && !r.isSystem ? (
                <Button variant="ghost" size="sm" className="text-danger-700" onClick={() => setDeleting(r)}>
                  Delete
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      <RoleDialog role={editing} open={open} onOpenChange={setOpen} groups={catalog.data} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete role “${deleting?.name}”?`}
        description="Roles that are assigned to members cannot be deleted. Reassign those members first."
        confirmLabel="Delete role"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => { toast.success('Role deleted'); setDeleting(null); },
            onError: (err) => toast.error(errorMessage(err)),
          });
        }}
      />
    </>
  );
}
