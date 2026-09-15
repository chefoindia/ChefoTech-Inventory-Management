'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Monitor, LogOut } from 'lucide-react';
import { changePasswordSchema, updateProfileSchema, type ChangePasswordInput, type UpdateProfileInput } from '@pharmaos/shared';
import { useChangePassword, useSessions, useRevokeSession, useLogout } from '@/features/auth/api';
import { useUpdateProfile } from '@/features/users/api';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton, ErrorState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

function ProfileCard() {
  const me = useSession((s) => s.me)!;
  const update = useUpdateProfile();
  const form = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema), values: { name: me.user.name, phone: me.user.phone ?? '' } });
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: () => toast.success('Profile updated'),
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err));
      },
    }),
  );
  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>{me.user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <FormGrid>
            <FormField label="Name" htmlFor="profile-name" error={errors.name?.message} required>
              <Input {...form.register('name')} />
            </FormField>
            <FormField label="Phone" htmlFor="profile-phone" error={errors.phone?.message}>
              <Input type="tel" {...form.register('phone')} />
            </FormField>
          </FormGrid>
        </CardContent>
        <CardFooter>
          <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
            Save profile
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const change = useChangePassword();
  const form = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: '', newPassword: '' } });
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit((values) =>
    change.mutate(values, {
      onSuccess: () => {
        toast.success('Password changed. Other devices were signed out.');
        form.reset();
      },
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err));
      },
    }),
  );
  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Changing your password signs out every other device.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormGrid>
            <FormField label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message} required>
              <Input type="password" autoComplete="current-password" {...form.register('currentPassword')} />
            </FormField>
            <FormField label="New password" htmlFor="newPassword" error={errors.newPassword?.message} required hint="At least 10 characters.">
              <Input type="password" autoComplete="new-password" {...form.register('newPassword')} />
            </FormField>
          </FormGrid>
        </CardContent>
        <CardFooter>
          <Button type="submit" loading={change.isPending}>
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const logout = useLogout();
  const router = useRouter();
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setConfirmLogout(true)}>
          <LogOut className="h-3.5 w-3.5" /> Sign out this device
        </Button>
      </CardHeader>
      {sessions.isPending ? (
        <TableSkeleton rows={3} cols={3} />
      ) : sessions.isError ? (
        <ErrorState message={errorMessage(sessions.error)} onRetry={() => sessions.refetch()} />
      ) : (
        <ul className="divide-y divide-border">
          {sessions.data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <Monitor className="h-4 w-4 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">
                  {describeUserAgent(s.userAgent)} {s.current ? <Badge variant="primary" className="ml-1">This device</Badge> : null}
                </div>
                <div className="text-[12px] text-fg-subtle">
                  {s.ip ? `${s.ip} · ` : ''}last active {s.lastUsedAt ? relativeTime(s.lastUsedAt) : 'unknown'} · started {formatDateTime(s.createdAt)}
                </div>
              </div>
              {!s.current ? (
                <Button variant="ghost" size="sm" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id, { onSuccess: () => toast.success('Session revoked'), onError: (e) => toast.error(errorMessage(e)) })}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Sign out?"
        description="You will need to sign in again on this device."
        confirmLabel="Sign out"
        loading={logout.isPending}
        onConfirm={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
      />
    </Card>
  );
}

function describeUserAgent(ua?: string): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' on ');
}

export default function SecurityPage() {
  return (
    <>
      <PageHeader title="Security" description="Your profile, password and signed-in devices." />
      <div className="space-y-5">
        <ProfileCard />
        <PasswordCard />
        <SessionsCard />
      </div>
    </>
  );
}
