'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import type { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { updateOrganizationSchema, type UpdateOrganizationInput, type OrganizationDto, DOCUMENT_TYPES, DEFAULT_NUMBERING } from '@pharmaos/shared';
import { useOrganization, useUpdateOrganization } from '@/features/organization/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, Select, Checkbox } from '@/components/ui/input';
import { StateSelect } from '@/components/ui/state-select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Alert } from '@/components/ui/alert';

const DOC_LABELS: Record<(typeof DOCUMENT_TYPES)[number], string> = {
  sale: 'Sales invoice',
  purchase: 'Purchase invoice',
  grn: 'GRN',
  salesReturn: 'Sales return',
  purchaseReturn: 'Purchase return',
  customerPayment: 'Customer receipt',
  supplierPayment: 'Supplier payment',
  transfer: 'Stock transfer',
  adjustment: 'Stock adjustment',
};

type OrgFormValues = z.input<typeof updateOrganizationSchema>;

function toFormValues(org: OrganizationDto): OrgFormValues {
  const numbering = Object.fromEntries(
    DOCUMENT_TYPES.map((t) => [
      t,
      {
        prefix: org.settings.numbering[t]?.prefix ?? DEFAULT_NUMBERING[t].prefix,
        padding: org.settings.numbering[t]?.padding ?? DEFAULT_NUMBERING[t].padding,
        resetOnFinancialYear: org.settings.numbering[t]?.resetOnFinancialYear ?? false,
        perOutlet: org.settings.numbering[t]?.perOutlet ?? true,
      },
    ]),
  );
  return {
    name: org.name,
    legalName: org.legalName ?? '',
    email: org.email || undefined,
    phone: org.phone || undefined,
    website: org.website ?? '',
    address: { ...org.address },
    tax: { gstin: org.tax.gstin ?? '', pan: org.tax.pan ?? '', stateCode: org.tax.stateCode, registrationType: org.tax.registrationType as 'regular' },
    financialYearStartMonth: org.financialYearStartMonth,
    settings: {
      sales: { ...org.settings.sales },
      purchases: { ...org.settings.purchases },
      inventory: { ...org.settings.inventory },
      tax: { ...org.settings.tax },
      documents: { ...org.settings.documents },
      numbering,
    },
  };
}

export default function OrganizationSettingsPage() {
  const org = useOrganization();
  const update = useUpdateOrganization();
  const canManage = usePermission('organization.manage');
  const form = useForm<OrgFormValues, unknown, UpdateOrganizationInput>({ resolver: zodResolver(updateOrganizationSchema) });
  const errors = form.formState.errors;

  useEffect(() => {
    if (org.data) form.reset(toFormValues(org.data));
  }, [org.data, form]);

  if (org.isPending) return <Spinner />;
  if (org.isError || !org.data) return <ErrorState message={errorMessage(org.error)} onRetry={() => org.refetch()} />;

  const onSubmit = form.handleSubmit((values) => {
    update.mutate(values, {
      onSuccess: () => toast.success('Organization settings saved'),
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err));
      },
    });
  });

  const readOnly = !canManage;
  const numberingPrefix = 'settings.numbering' as const;

  return (
    <>
      <PageHeader title="Organization" description="Business identity, tax details and the rules every outlet follows." />
      {readOnly ? <Alert variant="info" className="mb-4">You can view these settings but need the “Edit organization” permission to change them.</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={readOnly} className="space-y-5">
          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Profile & tax</TabsTrigger>
              <TabsTrigger value="rules">Business rules</TabsTrigger>
              <TabsTrigger value="numbering">Document numbering</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Identity</CardTitle>
                  <CardDescription>Shown on invoices and documents.</CardDescription>
                </CardHeader>
                <CardContent>
                  <FormGrid>
                    <FormField label="Display name" htmlFor="name" error={errors.name?.message} required>
                      <Input {...form.register('name')} />
                    </FormField>
                    <FormField label="Legal name" htmlFor="legalName" error={errors.legalName?.message}>
                      <Input {...form.register('legalName')} />
                    </FormField>
                    <FormField label="Email" htmlFor="email" error={errors.email?.message}>
                      <Input type="email" {...form.register('email')} />
                    </FormField>
                    <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
                      <Input type="tel" {...form.register('phone')} />
                    </FormField>
                    <FormField label="Website" htmlFor="website" error={errors.website?.message} className="sm:col-span-2">
                      <Input placeholder="https://" {...form.register('website')} />
                    </FormField>
                  </FormGrid>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Address</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormGrid>
                    <FormField label="Address line 1" htmlFor="address.line1" className="sm:col-span-2">
                      <Input {...form.register('address.line1')} />
                    </FormField>
                    <FormField label="Address line 2" htmlFor="address.line2" className="sm:col-span-2">
                      <Input {...form.register('address.line2')} />
                    </FormField>
                    <FormField label="City" htmlFor="address.city">
                      <Input {...form.register('address.city')} />
                    </FormField>
                    <FormField label="State" htmlFor="address.state">
                      <Input {...form.register('address.state')} />
                    </FormField>
                    <FormField label="PIN code" htmlFor="address.pincode" error={errors.address?.pincode?.message}>
                      <Input inputMode="numeric" {...form.register('address.pincode')} />
                    </FormField>
                  </FormGrid>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tax registration (GST)</CardTitle>
                  <CardDescription>State code decides CGST/SGST versus IGST on every document.</CardDescription>
                </CardHeader>
                <CardContent>
                  <FormGrid>
                    <FormField label="GSTIN" htmlFor="tax.gstin" error={errors.tax?.gstin?.message} hint="15 characters, e.g. 27ABCDE1234F1Z5">
                      <Input className="uppercase" maxLength={15} {...form.register('tax.gstin')} />
                    </FormField>
                    <FormField label="PAN" htmlFor="tax.pan" error={errors.tax?.pan?.message}>
                      <Input className="uppercase" maxLength={10} {...form.register('tax.pan')} />
                    </FormField>
                    <FormField label="State" htmlFor="tax.stateCode" error={errors.tax?.stateCode?.message} required>
                      <StateSelect {...form.register('tax.stateCode')} />
                    </FormField>
                    <FormField label="Registration type" htmlFor="tax.registrationType">
                      <Select {...form.register('tax.registrationType')}>
                        <option value="regular">Regular</option>
                        <option value="composition">Composition</option>
                        <option value="unregistered">Unregistered</option>
                      </Select>
                    </FormField>
                    <FormField label="Financial year starts in" htmlFor="financialYearStartMonth">
                      <Select {...form.register('financialYearStartMonth', { valueAsNumber: true })}>
                        {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                          <option key={m} value={i + 1}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </FormGrid>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rules" className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Sales</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormGrid>
                    <FormField label="Max discount without override (%)" htmlFor="maxDiscount" hint="Staff need the “Override discount limit” permission beyond this.">
                      <Controller control={form.control} name="settings.sales.maxDiscountBps" render={({ field }) => <Input type="number" min={0} max={100} step={0.5} value={field.value === undefined ? '' : field.value / 100} onChange={(e) => field.onChange(e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100))} />} />
                    </FormField>
                    <FormField label="Default credit period (days)" htmlFor="settings.sales.defaultCreditDays">
                      <Input type="number" min={0} max={365} {...form.register('settings.sales.defaultCreditDays', { valueAsNumber: true })} />
                    </FormField>
                    <FormField label="Bill round-off" htmlFor="settings.sales.roundOff">
                      <Select {...form.register('settings.sales.roundOff')}>
                        <option value="nearest">Round to nearest rupee</option>
                        <option value="none">No rounding</option>
                      </Select>
                    </FormField>
                    <FormField label="Cancellation window (hours)" htmlFor="settings.sales.cancelWindowHours" hint="0 disables cancellation after completion.">
                      <Input type="number" min={0} max={720} {...form.register('settings.sales.cancelWindowHours', { valueAsNumber: true })} />
                    </FormField>
                  </FormGrid>
                  <div className="mt-4 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox {...form.register('settings.sales.requireCustomerForCredit')} /> Require a customer on credit sales
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox {...form.register('settings.sales.askEmailInvoice')} /> Ask to email the invoice after each sale
                    </label>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inventory & purchases</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormGrid>
                    <FormField label="Block sale within N days of expiry" htmlFor="settings.inventory.blockNearExpirySaleDays" hint="Expired stock is always blocked. 0 = no extra window.">
                      <Input type="number" min={0} max={365} {...form.register('settings.inventory.blockNearExpirySaleDays', { valueAsNumber: true })} />
                    </FormField>
                    <FormField label="Low-stock trigger" htmlFor="settings.inventory.lowStockMode">
                      <Select {...form.register('settings.inventory.lowStockMode')}>
                        <option value="reorderLevel">Reorder level</option>
                        <option value="minStock">Minimum stock</option>
                      </Select>
                    </FormField>
                    <FormField label="Adjustment approval threshold (₹)" htmlFor="adjThreshold" hint="Adjustments above this value need approval.">
                      <Controller control={form.control} name="settings.inventory.adjustmentApprovalThresholdMinor" render={({ field }) => <Input type="number" min={0} value={field.value === undefined ? '' : field.value / 100} onChange={(e) => field.onChange(e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100))} />} />
                    </FormField>
                    <FormField label="Prices include tax" htmlFor="settings.tax.pricesIncludeTax">
                      <Select {...form.register('settings.tax.pricesIncludeTax', { setValueAs: (v) => v === 'true' || v === true })}>
                        <option value="true">Yes (MRP-inclusive, India default)</option>
                        <option value="false">No (tax added on top)</option>
                      </Select>
                    </FormField>
                  </FormGrid>
                  <div className="mt-4 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox {...form.register('settings.purchases.requireGrnForStock')} /> Stock increases only on confirmed GRN (recommended)
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox {...form.register('settings.purchases.autoUpdateSellingPriceFromPurchase')} /> Update product selling price from the latest purchase
                    </label>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="numbering">
              <Card>
                <CardHeader>
                  <CardTitle>Document numbering</CardTitle>
                  <CardDescription>Numbers are assigned atomically when a document is committed; they never duplicate. Existing numbers are not renumbered.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-muted text-left text-[12px] uppercase tracking-wide text-fg-subtle">
                        <tr>
                          <th className="px-5 py-2 font-medium">Document</th>
                          <th className="px-3 py-2 font-medium">Prefix</th>
                          <th className="px-3 py-2 font-medium">Digits</th>
                          <th className="px-3 py-2 font-medium">Per outlet</th>
                          <th className="px-3 py-2 font-medium">Reset each FY</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {DOCUMENT_TYPES.map((t) => (
                          <tr key={t}>
                            <td className="px-5 py-2 font-medium text-fg">{DOC_LABELS[t]}</td>
                            <td className="px-3 py-2">
                              <Input className="h-8 w-24" aria-label={`${DOC_LABELS[t]} prefix`} {...form.register(`${numberingPrefix}.${t}.prefix`)} />
                            </td>
                            <td className="px-3 py-2">
                              <Input type="number" min={1} max={10} className="h-8 w-20" aria-label={`${DOC_LABELS[t]} padding`} {...form.register(`${numberingPrefix}.${t}.padding`, { valueAsNumber: true })} />
                            </td>
                            <td className="px-3 py-2">
                              <Checkbox aria-label={`${DOC_LABELS[t]} per outlet`} {...form.register(`${numberingPrefix}.${t}.perOutlet`)} />
                            </td>
                            <td className="px-3 py-2">
                              <Checkbox aria-label={`${DOC_LABELS[t]} reset each financial year`} {...form.register(`${numberingPrefix}.${t}.resetOnFinancialYear`)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {!readOnly ? (
            <Card>
              <CardFooter className="border-0">
                <Button type="button" variant="secondary" onClick={() => form.reset(toFormValues(org.data!))} disabled={!form.formState.isDirty || update.isPending}>
                  Discard changes
                </Button>
                <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
                  Save changes
                </Button>
              </CardFooter>
            </Card>
          ) : null}
        </fieldset>
      </form>
    </>
  );
}
