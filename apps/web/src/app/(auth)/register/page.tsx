'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { registerSchema, type RegisterInput } from '@pharmaos/shared';
import { useRegister } from '@/features/auth/api';
import { errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { track } from '@/lib/analytics';
import { useRef } from 'react';
import { GuestOnly } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, PasswordInput } from '@/components/ui/input';
import { StateSelect } from '@/components/ui/state-select';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export default function RegisterPage() {
  const router = useRouter();
  const register = useRegister();
  const form = useForm<z.input<typeof registerSchema>, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { organizationName: '', ownerName: '', email: '', phone: '', password: '', stateCode: '' },
  });
  const errors = form.formState.errors;
  const started = useRef(false);
  const onFirstInput = () => {
    if (started.current) return;
    started.current = true;
    track('signup_started');
  };

  const onSubmit = form.handleSubmit((values) => {
    register.mutate(values, {
      onSuccess: () => {
        track('signup_completed');
        router.replace('/dashboard');
      },
      onError: (err) => applyServerErrors(err, form.setError),
    });
  });

  const serverError = register.error && !Object.keys(errors).length ? errorMessage(register.error) : null;

  return (
    <GuestOnly>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create your organization</CardTitle>
          <CardDescription>Sets up your pharmacy, a main outlet and your owner account. 14-day trial, no card needed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate onInput={onFirstInput}>
            {serverError ? <Alert variant="danger">{serverError}</Alert> : null}
            <FormField info="Your shop name as customers know it. It appears on your bills and can be changed later in Settings." label="Pharmacy / organization name" htmlFor="organizationName" error={errors.organizationName?.message} required>
              <Input autoFocus placeholder="e.g. Apollo Care Pharmacy" {...form.register('organizationName')} />
            </FormField>
            <FormField info="The state your shop is registered in. It decides whether bills carry CGST plus SGST or IGST, so pick the one on your GST certificate." label="State (for GST)" htmlFor="stateCode" error={errors.stateCode?.message} required hint="Used to decide CGST/SGST vs IGST on invoices.">
              <StateSelect {...form.register('stateCode')} />
            </FormField>
            <FormGrid>
              <FormField info="Your own name. You become the owner of this organization, and your name appears in the audit trail." label="Your name" htmlFor="ownerName" error={errors.ownerName?.message} required>
                <Input autoComplete="name" {...form.register('ownerName')} />
              </FormField>
              <FormField info="Your contact number. Optional, and used only to reach you about your account." label="Phone" htmlFor="phone" error={errors.phone?.message}>
                <Input type="tel" autoComplete="tel" placeholder="+91" {...form.register('phone')} />
              </FormField>
            </FormGrid>
            <FormField info="The address you will sign in with, and where account emails are sent." label="Email" htmlFor="email" error={errors.email?.message} required>
              <Input type="email" autoComplete="email" {...form.register('email')} />
            </FormField>
            <FormField info="At least 10 characters. This account can see your whole business, so use something you do not use elsewhere." label="Password" htmlFor="password" error={errors.password?.message} required hint="At least 10 characters.">
              <PasswordInput autoComplete="new-password" {...form.register('password')} />
            </FormField>
            <Button type="submit" className="w-full" size="lg" loading={register.isPending}>
              Create organization
            </Button>
            <p className="text-center text-[12px] text-fg-subtle">
              By creating an organization you agree to the <Link href="/terms" className="underline hover:text-fg">terms of service</Link> and <Link href="/privacy" className="underline hover:text-fg">privacy policy</Link>.
            </p>
          </form>
          <p className="mt-5 text-center text-[13px] text-fg-subtle">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary-700 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </GuestOnly>
  );
}
