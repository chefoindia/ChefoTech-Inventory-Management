'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import { createCustomerSchema, createSupplierSchema, type CreateCustomerInput, type CreateSupplierInput, type CustomerDto, type SupplierDto } from '@pharmaos/shared';
import { useCreateCustomer, useUpdateCustomer, useCreateSupplier, useUpdateSupplier } from './api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { dateInput } from '@/lib/format';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { StateSelect } from '@/components/ui/state-select';
import { MoneyInput, PercentInput } from '@/components/ui/money-input';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';

type CustomerValues = z.input<typeof createCustomerSchema>;

export function CustomerDialog({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customer: CustomerDto | null; onSaved?: (c: CustomerDto) => void }) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const me = useSession((s) => s.me);
  const canOverride = usePermission('customers.overrideCreditLimit');
  const canManageCustomers = usePermission('customers.manage');
  const canCredit = canOverride || canManageCustomers;
  const form = useForm<CustomerValues, unknown, CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    values: customer
      ? { name: customer.name, phone: customer.phone, altPhone: customer.altPhone || undefined, email: customer.email || undefined, address: { ...customer.address }, gstin: customer.gstin, stateCode: customer.stateCode, dateOfBirth: customer.dateOfBirth ? new Date(customer.dateOfBirth) : undefined, gender: (customer.gender || '') as CustomerValues['gender'], creditLimitMinor: customer.creditLimitMinor, creditDays: customer.creditDays ?? undefined, openingBalanceMinor: customer.openingBalanceMinor, defaultDiscountBps: customer.defaultDiscountBps, tags: customer.tags, notes: customer.notes, customFields: customer.customFields ?? {} }
      : { name: '', phone: '', address: {}, gstin: '', stateCode: me?.organization.tax.stateCode ?? '', gender: '', creditLimitMinor: 0, openingBalanceMinor: 0, defaultDiscountBps: 0, tags: [], notes: '', customFields: {} },
  });
  const errors = form.formState.errors;
  const pending = create.isPending || update.isPending;
  const onSubmit = form.handleSubmit((values) => {
    const fail = (err: unknown) => { if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err)); };
    if (customer) update.mutate({ id: customer.id, input: values }, { onSuccess: (c) => { toast.success('Customer updated'); onOpenChange(false); onSaved?.(c); }, onError: fail });
    else create.mutate(values, { onSuccess: (c) => { toast.success(c.duplicatePhoneWarning ? `Customer created · ${c.duplicatePhoneWarning}` : 'Customer created'); onOpenChange(false); form.reset(); onSaved?.(c); }, onError: fail });
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent title={customer ? `Edit ${customer.name}` : 'New customer'} description="Phone number identifies the customer across outlets." size="lg">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormGrid>
            <FormField label="Name" htmlFor="c-name" error={errors.name?.message} required><Input autoFocus {...form.register('name')} /></FormField>
            <FormField label="Phone" htmlFor="c-phone" error={errors.phone?.message} required><Input type="tel" inputMode="tel" {...form.register('phone')} /></FormField>
            <FormField label="Alternate phone" htmlFor="c-alt" error={errors.altPhone?.message}><Input type="tel" {...form.register('altPhone', { setValueAs: (v) => v || undefined })} /></FormField>
            <FormField label="Email" htmlFor="c-email" error={errors.email?.message} hint="Used for emailed invoices."><Input type="email" {...form.register('email', { setValueAs: (v) => v || undefined })} /></FormField>
            <FormField label="Date of birth" htmlFor="c-dob" error={errors.dateOfBirth?.message}><Input type="date" defaultValue={customer?.dateOfBirth ? dateInput(customer.dateOfBirth) : ''} {...form.register('dateOfBirth', { setValueAs: (v) => (v ? new Date(v) : undefined) })} /></FormField>
            <FormField label="Gender" htmlFor="c-gender"><Select {...form.register('gender')}><option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></Select></FormField>
            <FormField label="Address" htmlFor="address.line1" className="sm:col-span-2"><Input {...form.register('address.line1')} /></FormField>
            <FormField label="City" htmlFor="address.city"><Input {...form.register('address.city')} /></FormField>
            <FormField label="PIN code" htmlFor="address.pincode"><Input inputMode="numeric" {...form.register('address.pincode')} /></FormField>
            <FormField label="GSTIN" htmlFor="c-gstin" error={errors.gstin?.message} hint="For B2B invoices."><Input className="uppercase" maxLength={15} {...form.register('gstin')} /></FormField>
            <FormField label="State (place of supply)" htmlFor="c-state" error={errors.stateCode?.message}><StateSelect {...form.register('stateCode')} /></FormField>
            {canCredit ? (
              <>
                <FormField label="Credit limit" htmlFor="c-limit" error={errors.creditLimitMinor?.message} hint="0 means no credit (Baki) allowed."><Controller control={form.control} name="creditLimitMinor" render={({ field }) => <MoneyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} />} /></FormField>
                <FormField label="Credit days" htmlFor="c-days" error={errors.creditDays?.message}><Input type="number" min={0} {...form.register('creditDays', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })} /></FormField>
              </>
            ) : null}
            {!customer ? <FormField label="Opening balance" htmlFor="c-open" hint="Amount the customer already owes you."><Controller control={form.control} name="openingBalanceMinor" render={({ field }) => <MoneyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} allowNegative />} /></FormField> : null}
            <FormField label="Default discount" htmlFor="c-disc" error={errors.defaultDiscountBps?.message}><Controller control={form.control} name="defaultDiscountBps" render={({ field }) => <PercentInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} />} /></FormField>
            <FormField label="Tags" htmlFor="c-tags" hint="Comma separated."><Controller control={form.control} name="tags" render={({ field }) => <Input value={(field.value ?? []).join(', ')} onChange={(e) => field.onChange(e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} />} /></FormField>
            <FormField label="Notes" htmlFor="c-notes" className="sm:col-span-2"><Textarea {...form.register('notes')} /></FormField>
          </FormGrid>
          <Controller control={form.control} name="customFields" render={({ field }) => <CustomFieldsForm entity="customer" values={(field.value ?? {}) as Record<string, unknown>} onChange={field.onChange} entityId={customer?.id} />} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" loading={pending}>{customer ? 'Save changes' : 'Create customer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SupplierValues = z.input<typeof createSupplierSchema>;

export function SupplierDialog({ open, onOpenChange, supplier, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; supplier: SupplierDto | null; onSaved?: (s: SupplierDto) => void }) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const me = useSession((s) => s.me);
  const form = useForm<SupplierValues, unknown, CreateSupplierInput>({
    resolver: zodResolver(createSupplierSchema),
    values: supplier
      ? { name: supplier.name, code: supplier.code, contactPerson: supplier.contactPerson, phone: supplier.phone || undefined, altPhone: supplier.altPhone || undefined, email: supplier.email || undefined, address: { ...supplier.address }, gstin: supplier.gstin, stateCode: supplier.stateCode, pan: supplier.pan, drugLicenseNo: supplier.drugLicenseNo, paymentTermsDays: supplier.paymentTermsDays, openingBalanceMinor: supplier.openingBalanceMinor, bank: supplier.bank ?? { accountName: '', accountNumber: '', ifsc: '', upiId: '' }, notes: supplier.notes, customFields: supplier.customFields ?? {} }
      : { name: '', code: '', contactPerson: '', address: {}, gstin: '', stateCode: me?.organization.tax.stateCode ?? '', pan: '', drugLicenseNo: '', paymentTermsDays: 30, openingBalanceMinor: 0, bank: { accountName: '', accountNumber: '', ifsc: '', upiId: '' }, notes: '', customFields: {} },
  });
  const errors = form.formState.errors;
  const pending = create.isPending || update.isPending;
  const onSubmit = form.handleSubmit((values) => {
    const fail = (err: unknown) => { if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err)); };
    if (supplier) update.mutate({ id: supplier.id, input: values }, { onSuccess: (s) => { toast.success('Supplier updated'); onOpenChange(false); onSaved?.(s); }, onError: fail });
    else create.mutate(values, { onSuccess: (s) => { toast.success('Supplier created'); onOpenChange(false); form.reset(); onSaved?.(s); }, onError: fail });
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent title={supplier ? `Edit ${supplier.name}` : 'New supplier'} description="GSTIN and state decide whether purchases carry IGST or CGST+SGST." size="lg">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormGrid>
            <FormField label="Name" htmlFor="s-name" error={errors.name?.message} required className="sm:col-span-2"><Input autoFocus {...form.register('name')} /></FormField>
            <FormField label="Code" htmlFor="s-code" error={errors.code?.message} hint="Optional short code."><Input className="uppercase" {...form.register('code')} /></FormField>
            <FormField label="Contact person" htmlFor="s-contact"><Input {...form.register('contactPerson')} /></FormField>
            <FormField label="Phone" htmlFor="s-phone" error={errors.phone?.message}><Input type="tel" {...form.register('phone', { setValueAs: (v) => v || undefined })} /></FormField>
            <FormField label="Email" htmlFor="s-email" error={errors.email?.message}><Input type="email" {...form.register('email', { setValueAs: (v) => v || undefined })} /></FormField>
            <FormField label="GSTIN" htmlFor="s-gstin" error={errors.gstin?.message}><Input className="uppercase" maxLength={15} {...form.register('gstin', { onChange: (e) => { const v = String(e.target.value); if (v.length >= 2 && /^\d{2}/.test(v)) form.setValue('stateCode', v.slice(0, 2)); } })} /></FormField>
            <FormField label="State" htmlFor="s-state" error={errors.stateCode?.message}><StateSelect {...form.register('stateCode')} /></FormField>
            <FormField label="PAN" htmlFor="s-pan" error={errors.pan?.message}><Input className="uppercase" maxLength={10} {...form.register('pan')} /></FormField>
            <FormField label="Drug licence no." htmlFor="s-dl"><Input {...form.register('drugLicenseNo')} /></FormField>
            <FormField label="Payment terms (days)" htmlFor="s-terms" error={errors.paymentTermsDays?.message}><Input type="number" min={0} {...form.register('paymentTermsDays', { valueAsNumber: true })} /></FormField>
            {!supplier ? <FormField label="Opening balance" htmlFor="s-open" hint="Amount you already owe this supplier."><Controller control={form.control} name="openingBalanceMinor" render={({ field }) => <MoneyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} allowNegative />} /></FormField> : null}
            <FormField label="Address" htmlFor="address.line1" className="sm:col-span-2"><Input {...form.register('address.line1')} /></FormField>
            <FormField label="City" htmlFor="address.city"><Input {...form.register('address.city')} /></FormField>
            <FormField label="PIN code" htmlFor="address.pincode"><Input inputMode="numeric" {...form.register('address.pincode')} /></FormField>
            <FormField label="Bank account name" htmlFor="bank.accountName"><Input {...form.register('bank.accountName')} /></FormField>
            <FormField label="Account number" htmlFor="bank.accountNumber"><Input {...form.register('bank.accountNumber')} /></FormField>
            <FormField label="IFSC" htmlFor="bank.ifsc"><Input className="uppercase" {...form.register('bank.ifsc')} /></FormField>
            <FormField label="UPI ID" htmlFor="bank.upiId"><Input {...form.register('bank.upiId')} /></FormField>
            <FormField label="Notes" htmlFor="s-notes" className="sm:col-span-2"><Textarea {...form.register('notes')} /></FormField>
          </FormGrid>
          <Controller control={form.control} name="customFields" render={({ field }) => <CustomFieldsForm entity="supplier" values={(field.value ?? {}) as Record<string, unknown>} onChange={field.onChange} entityId={supplier?.id} />} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" loading={pending}>{supplier ? 'Save changes' : 'Create supplier'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
