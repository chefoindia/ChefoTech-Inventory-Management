'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@pharmaos/shared';
import { useLogin } from '@/features/auth/api';
import { ApiError, errorMessage } from '@/lib/api-client';
import { track } from '@/lib/analytics';
import { GuestOnly } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => {
        track('login_completed');
        router.replace(params.get('next') || '/dashboard');
      },
      onError: (err) => {
        if (err instanceof ApiError) {
          for (const [field, message] of Object.entries(err.fieldErrors())) {
            form.setError(field as keyof LoginInput, { message });
          }
        }
      },
    });
  });

  const serverError = login.error && !(login.error instanceof ApiError && login.error.details.length) ? errorMessage(login.error) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sign in</CardTitle>
        <CardDescription>Use your PharmaOS account to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError ? <Alert variant="danger">{serverError}</Alert> : null}
          <FormField label="Email" htmlFor="email" error={form.formState.errors.email?.message} required>
            <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
          </FormField>
          <FormField label="Password" htmlFor="password" error={form.formState.errors.password?.message} required>
            <Input type="password" autoComplete="current-password" {...form.register('password')} />
          </FormField>
          <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
            Sign in
          </Button>
        </form>
        <p className="mt-5 text-center text-[13px] text-fg-subtle">
          New pharmacy?{' '}
          <Link href="/register" className="font-medium text-primary-700 hover:underline">
            Create an organization
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <GuestOnly>
      <Suspense>
        <LoginForm />
      </Suspense>
    </GuestOnly>
  );
}
