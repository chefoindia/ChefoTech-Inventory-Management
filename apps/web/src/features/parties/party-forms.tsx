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
            <FormField info="The name you will search for at the counter and the name printed on the bill and on statements." label="Name" htmlFor="c-name" error={errors.name?.message} required><Input autoFocus {...form.register('name')} /></FormField>
            <FormField info="The main number. At the counter you can find this party by typing the phone number, so it is the fastest way to pull up a regular." label="Phone" htmlFor="c-phone" error={errors.phone?.message} required><Input type="tel" inputMode="tel" {...form.register('phone')} /></FormField>
            <FormField info="A second number, for example a family member. Only used when you need to reach them." label="Alternate phone" htmlFor="c-alt" error={errors.altPhone?.message}><Input type="tel" {...form.register('altPhone', { setValueAs: (v) => v || undefined })} /></FormField>
            <FormField info="Where invoices, receipts and account statements are emailed when you choose to send them." label="Email" htmlFor="c-email" error={errors.email?.message} hint="Used for emailed invoices."><Input type="email" {...form.register('email', { setValueAs: (v) => v || undefined })} /></FormField>
            <FormField info="Optional. Handy for age-appropriate advice and for birthday reminders; it is never printed on the bill." label="Date of birth" htmlFor="c-dob" error={errors.dateOfBirth?.message}><Input type="date" defaultValue={customer?.dateOfBirth ? dateInput(customer.dateOfBirth) : ''} {...form.register('dateOfBirth', { setValueAs: (v) => (v ? new Date(v) : undefined) })} /></FormField>
            <FormField info="Optional. Some prescriptions and registers ask for it." label="Gender" htmlFor="c-gender"><Select {...form.register('gender')}><option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></Select></FormField>
            <FormField info="Street address. It prints on the invoice and on statements, and is used for deliveries." label="Address" htmlFor="address.line1" className="sm:col-span-2"><Input {...form.register('address.line1')} /></FormField>
            <FormField info="Town or city. Prints on the invoice and helps you group customers by area." label="City" htmlFor="address.city"><Input {...form.register('address.city')} /></FormField>
            <FormField info="Postal code. Prints on the invoice, and matters for deliveries and GST records." label="PIN code" htmlFor="address.pincode"><Input inputMode="numeric" {...form.register('address.pincode')} /></FormField>
            <FormField info="The 15-character GST number, only for business customers who need a tax invoice in their firm name. Leave it blank for ordinary retail customers." label="GSTIN" htmlFor="c-gstin" error={errors.gstin?.message} hint="For B2B invoices."><Input className="uppercase" maxLength={15} {...form.register('gstin')} /></FormField>
            <FormField info="The state deciding how GST splits on their bills: same state as your outlet means CGST plus SGST, a different state means IGST." label="State (place of supply)" htmlFor="c-state" error={errors.stateCode?.message}><StateSelect {...form.register('stateCode')} /></FormField>
            {canCredit ? (
              <>
                <FormField info="The most this customer may owe you at any time. When a credit sale would cross it, the counter warns before completing the bill. Zero means no limit is enforced." label="Credit limit" htmlFor="c-limit" error={errors.creditLimitMinor?.message} hint="0 means no credit (Baki) allowed."><Controller control={form.control} name="creditLimitMinor" render={({ field }) => <MoneyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} />} /></FormField>
                <FormField info="How many days they normally take to pay. Used to work out which dues are overdue in your receivables report." label="Credit days" htmlFor="c-days" error={errors.creditDays?.message}><Input type="number" min={0} {...form.register('creditDays', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })} /></FormField>
              </>
            ) : null}
            {!customer ? <FormField info="What they already owed you on the day you started using PharmaOS. Enter it once so the ledger matches your old book; leave it at zero for a new customer." label="Opening balance" htmlFor="c-open" hint="Amount the customer already owes you."><Controller control={form.control} name="openingBalanceMinor" render={({ field }) => <MoneyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} allowNegative />} /></FormField> : null}
            <FormField info="A standing discount applied automatically at the counter for this customer, for example for staff or a regular family. Staff can still change it on the bill." label="Default discount" htmlFor="c-disc" error={errors.defaultDiscountBps?.message}><Controller control={form.control} name="defaultDiscountBps" render={({ field }) => <PercentInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} />} /></FormField>
            <FormField info="Free labels for your own filtering, such as diabetic, senior citizen or wholesale. Separate them with commas." label="Tags" htmlFor="c-tags" hint="Comma separated."><Controller control={form.control} name="tags" render={({ field }) => <Input value={(field.value ?? []).join(', ')} onChange={(e) => field.onChange(e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} />} /></FormField>
            <FormField info="Anything your team should know about this party. Staff see it on their page; it never appears on the customer bill." label="Notes" htmlFor="c-notes" className="sm:col-span-2"><Textarea {...form.register('notes')} /></FormField>
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
            <FormField info="The name you will search for at the counter and the name printed on the bill and on statements." label="Name" htmlFor="s-name" error={errors.name?.message} required className="sm:col-span-2"><Input autoFocus {...form.register('name')} /></FormField>
            <FormField info="A short code you use internally for this supplier, for example MED01. Handy when two suppliers have similar names." label="Code" htmlFor="s-code" error={errors.code?.message} hint="Optional short code."><Input className="uppercase" {...form.register('code')} /></FormField>
            <FormField info="The person you actually speak to at the supplier, so anyone in your shop can follow up on an order." label="Contact person" htmlFor="s-contact"><Input {...form.register('contactPerson')} /></FormField>
            <FormField info="The main number. At the counter you can find this party by typing the phone number, so it is the fastest way to pull up a regular." label="Phone" htmlFor="s-phone" error={errors.phone?.message}><Input type="tel" {...form.register('phone', { setValueAs: (v) => v || undefined })} /></FormField>
            <FormField info="Where invoices, receipts and account statements are emailed when you choose to send them." label="Email" htmlFor="s-email" error={errors.email?.message}><Input type="email" {...form.register('email', { setValueAs: (v) => v || undefined })} /></FormField>
            <FormField info="The 15-character GST number, only for business customers who need a tax invoice in their firm name. Leave it blank for ordinary retail customers." label="GSTIN" htmlFor="s-gstin" error={errors.gstin?.message}><Input className="uppercase" maxLength={15} {...form.register('gstin', { onChange: (e) => { const v = String(e.target.value); if (v.length >= 2 && /^\d{2}/.test(v)) form.setValue('stateCode', v.slice(0, 2)); } })} /></FormField>
            <FormField info="The supplier state, which decides whether their invoices to you carry IGST or CGST plus SGST." label="State" htmlFor="s-state" error={errors.stateCode?.message}><StateSelect {...form.register('stateCode')} /></FormField>
            <FormField info="The supplier income-tax number, taken from their invoice. Kept for your accounts; it is not used in billing." label="PAN" htmlFor="s-pan" error={errors.pan?.message}><Input className="uppercase" maxLength={10} {...form.register('pan')} /></FormField>
            <FormField info="The supplier drug licence number. Recording it is part of the paperwork a drug inspector may ask to see." label="Drug licence no." htmlFor="s-dl"><Input {...form.register('drugLicenseNo')} /></FormField>
            <FormField info="How many days after the invoice date payment is due, for example 30. Due dates on purchases are filled in from this automatically." label="Payment terms (days)" htmlFor="s-terms" error={errors.paymentTermsDays?.message}><Input type="number" min={0} {...form.register('paymentTermsDays', { valueAsNumber: true })} /></FormField>
            {!supplier ? <FormField info="What they already owed you on the day you started using PharmaOS. Enter it once so the ledger matches your old book; leave it at zero for a new customer." label="Opening balance" htmlFor="s-open" hint="Amount you already owe this supplier."><Controller control={form.control} name="openingBalanceMinor" render={({ field }) => <MoneyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} allowNegative />} /></FormField> : null}
            <FormField info="Street address. It prints on the invoice and on statements, and is used for deliveries." label="Address" htmlFor="address.line1" className="sm:col-span-2"><Input {...form.register('address.line1')} /></FormField>
            <FormField info="Town or city. Prints on the invoice and helps you group customers by area." label="City" htmlFor="address.city"><Input {...form.register('address.city')} /></FormField>
            <FormField info="Postal code. Prints on the invoice, and matters for deliveries and GST records." label="PIN code" htmlFor="address.pincode"><Input inputMode="numeric" {...form.register('address.pincode')} /></FormField>
            <FormField info="The name on the supplier bank account, exactly as their bank has it. Used when you pay by transfer." label="Bank account name" htmlFor="bank.accountName"><Input {...form.register('bank.accountName')} /></FormField>
            <FormField info="The supplier bank account number for transfers. Stored for your convenience when paying." label="Account number" htmlFor="bank.accountNumber"><Input {...form.register('bank.accountNumber')} /></FormField>
            <FormField info="The supplier bank branch code used for NEFT, RTGS and IMPS transfers." label="IFSC" htmlFor="bank.ifsc"><Input className="uppercase" {...form.register('bank.ifsc')} /></FormField>
            <FormField info="The supplier UPI address, if they accept UPI payments." label="UPI ID" htmlFor="bank.upiId"><Input {...form.register('bank.upiId')} /></FormField>
            <FormField info="Anything your team should know about this party. Staff see it on their page; it never appears on the customer bill." label="Notes" htmlFor="s-notes" className="sm:col-span-2"><Textarea {...form.register('notes')} /></FormField>
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
