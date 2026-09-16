'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useInvitationPreview, useAcceptInvitation } from '@/features/auth/api';
import { errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, PasswordInput } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Spinner, ErrorState } from '@/components/ui/states';

interface AcceptForm {
  name: string;
  password: string;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const form = useForm<AcceptForm>({ defaultValues: { name: '', password: '' } });

  if (preview.isPending) return <Spinner />;
  if (preview.isError || !preview.data) {
    return (
      <Card>
        <ErrorState message="This invitation is invalid, expired or already used. Ask the person who invited you to send a new one." />
      </Card>
    );
  }
  const inv = preview.data;

  const onSubmit = form.handleSubmit((values) => {
    accept.mutate(
      { token, name: values.name || undefined, password: inv.requiresPassword ? values.password : undefined },
      {
        onSuccess: () => {
          toast.success(`You joined ${inv.organizationName}. Sign in to continue.`);
          router.replace('/login');
        },
        onError: (err) => {
          if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err));
        },
      },
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Join {inv.organizationName}</CardTitle>
        <CardDescription>
          You have been invited as <strong>{inv.roleName}</strong> using {inv.email}. Valid until {formatDate(inv.expiresAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {inv.requiresPassword ? (
            <>
              <FormField info="Your own name, as your colleagues and the audit trail will show it." label="Your name" htmlFor="name" error={form.formState.errors.name?.message}>
                <Input defaultValue={inv.name} placeholder={inv.name} {...form.register('name')} />
              </FormField>
              <FormField info="At least 10 characters, and only yours. Every action you take is recorded against your account." label="Create a password" htmlFor="password" error={form.formState.errors.password?.message} required hint="At least 10 characters.">
                <PasswordInput autoComplete="new-password" {...form.register('password', { required: 'Required', minLength: { value: 10, message: 'At least 10 characters' } })} />
              </FormField>
            </>
          ) : (
            <Alert variant="info">You already have a PharmaOS account with this email. Accepting adds this organization to it.</Alert>
          )}
          <Button type="submit" className="w-full" size="lg" loading={accept.isPending}>
            Accept invitation
          </Button>
        </form>
        <p className="mt-5 text-center text-[13px] text-fg-subtle">
          Not you?{' '}
          <Link href="/" className="font-medium text-primary-700 hover:underline">
            Go to homepage
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
