'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { usePathname } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import type { z } from 'zod';
import { createLeadSchema, type CreateLeadInput, type LeadType } from '@pharmaos/shared';
import { api, errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { track } from '@/lib/analytics';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Demo / contact / sales enquiry form. Posts to the public leads endpoint; the API stores the lead
 * and emails the configured inbox. Honeypot + consent checkbox; no third-party form service.
 */
export function LeadForm({ type, submitLabel = 'Send request', compact = false }: { type: LeadType; submitLabel?: string; compact?: boolean }) {
  const pathname = usePathname();
  const [done, setDone] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const form = useForm<z.input<typeof createLeadSchema>, unknown, CreateLeadInput>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: { type, name: '', email: '', phone: '', pharmacyName: '', outlets: '', message: '', source: pathname ?? '', website: '', consent: false },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    setServerError(null);
    try {
      await api.post('/leads', { ...values, source: pathname ?? values.source });
      track(type === 'demo' ? 'demo_requested' : 'contact_submitted', { page: pathname ?? '', outlets: values.outlets || 'unspecified' });
      setDone(true);
    } catch (err) {
      applyServerErrors(err, form.setError);
      setServerError(errorMessage(err));
    } finally {
      setPending(false);
    }
  });

  if (done) {
    return (
      <div role="status" className="rounded-[var(--radius-card)] border border-success-600/20 bg-success-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success-600" aria-hidden />
        <h3 className="mt-3 text-lg font-semibold text-fg">{type === 'demo' ? 'Demo request received' : 'Message received'}</h3>
        <p className="mt-1 text-[14px] text-fg-muted">Thank you. The ChefoTech team will reply to the email address you gave, usually within one working day.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {serverError && !Object.keys(errors).length ? <Alert variant="danger">{serverError}</Alert> : null}
      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor="lead-website">Website</label>
        <input id="lead-website" type="text" tabIndex={-1} autoComplete="off" {...form.register('website')} />
      </div>
      <FormGrid>
        <FormField info="So we know who we are writing back to." label="Your name" htmlFor="lead-name" required error={errors.name?.message}>
          <Input autoComplete="name" {...form.register('name')} />
        </FormField>
        <FormField info="Where we will reply. We use it only to answer this enquiry." label="Email" htmlFor="lead-email" required error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </FormField>
        <FormField info="Optional, if you would rather we call or message you." label="Phone / WhatsApp" htmlFor="lead-phone" error={errors.phone?.message}>
          <Input type="tel" autoComplete="tel" inputMode="tel" placeholder="+91" {...form.register('phone')} />
        </FormField>
        <FormField info="Helps us come prepared with the right example for your kind of shop." label="Pharmacy name" htmlFor="lead-pharmacy" error={errors.pharmacyName?.message}>
          <Input autoComplete="organization" {...form.register('pharmacyName')} />
        </FormField>
        {!compact ? (
          <FormField info="Tells us whether to show you the single-shop setup or how branches and transfers work." label="Number of outlets" htmlFor="lead-outlets" error={errors.outlets?.message}>
            <Select {...form.register('outlets')}>
              <option value="">Select…</option>
              <option value="1">1 outlet</option>
              <option value="2-3">2–3 outlets</option>
              <option value="4-10">4–10 outlets</option>
              <option value="10+">More than 10</option>
            </Select>
          </FormField>
        ) : null}
      </FormGrid>
      <FormField label={type === 'demo' ? 'Anything specific you want to see?' : 'Message'} htmlFor="lead-message" error={errors.message?.message}>
        <Textarea rows={4} {...form.register('message')} />
      </FormField>
      <div>
        <label className="flex items-start gap-2 text-[13px] text-fg-muted">
          <Checkbox id="lead-consent" aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? 'lead-consent-error' : undefined} {...form.register('consent')} />
          <span>I agree that ChefoTech may contact me about this enquiry. Details are used only to respond to it.</span>
        </label>
        {errors.consent?.message ? <p id="lead-consent-error" className="mt-1 text-[12px] text-danger-600">{errors.consent.message}</p> : null}
      </div>
      <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
