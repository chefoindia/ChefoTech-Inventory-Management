'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, MoreHorizontal, Store } from 'lucide-react';
import type { z } from 'zod';
import { createOutletSchema, type CreateOutletInput, type OutletDto } from '@pharmaos/shared';
import { useOutlets, useCreateOutlet, useUpdateOutlet, useArchiveOutlet } from '@/features/outlets/api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, Select } from '@/components/ui/input';
import { StateSelect } from '@/components/ui/state-select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type OutletFormValues = z.input<typeof createOutletSchema>;

function OutletDialog({ open, onOpenChange, outlet }: { open: boolean; onOpenChange: (o: boolean) => void; outlet: OutletDto | null }) {
  const create = useCreateOutlet();
  const update = useUpdateOutlet();
  const me = useSession((s) => s.me);
  const form = useForm<OutletFormValues, unknown, CreateOutletInput>({
    resolver: zodResolver(createOutletSchema),
    values: outlet
      ? {
          name: outlet.name,
          code: outlet.code,
          type: outlet.type,
          stateCode: outlet.stateCode,
          gstin: outlet.gstin ?? '',
          drugLicenseNo: outlet.drugLicenseNo ?? '',
          drugLicenseExpiry: outlet.drugLicenseExpiry ? new Date(outlet.drugLicenseExpiry) : undefined,
          phone: outlet.phone || undefined,
          email: outlet.email || undefined,
          address: { ...outlet.address },
          settings: { ...outlet.settings } as OutletFormValues['settings'],
        }
      : {
          name: '',
          code: '',
          type: 'retail',
          stateCode: me?.organization.tax.stateCode ?? '',
          gstin: me?.organization.tax.gstin ?? '',
          drugLicenseNo: '',
          address: {},
          settings: { defaultPrinter: 'a4', autoPrintOnSale: false, invoiceFooterNote: '', businessHours: '' },
        },
  });
  const errors = form.formState.errors;
  const pending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    const done = () => {
      toast.success(outlet ? 'Outlet updated' : 'Outlet created');
      onOpenChange(false);
      form.reset();
    };
    const fail = (err: unknown) => {
      if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err));
    };
    if (outlet) update.mutate({ id: outlet.id, input: values }, { onSuccess: done, onError: fail });
    else create.mutate(values, { onSuccess: done, onError: fail });
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent title={outlet ? `Edit ${outlet.name}` : 'New outlet'} description="Each outlet keeps its own stock, sales, numbering and printer defaults." size="lg">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormGrid>
            <FormField label="Outlet name" htmlFor="name" error={errors.name?.message} required>
              <Input autoFocus {...form.register('name')} />
            </FormField>
            <FormField label="Code" htmlFor="code" error={errors.code?.message} required hint="Short unique code, used in document numbers.">
              <Input className="uppercase" maxLength={10} {...form.register('code')} />
            </FormField>
            <FormField label="Type" htmlFor="type">
              <Select {...form.register('type')}>
                <option value="retail">Retail counter</option>
                <option value="warehouse">Warehouse / godown</option>
              </Select>
            </FormField>
            <FormField label="State" htmlFor="stateCode" error={errors.stateCode?.message} required>
              <StateSelect {...form.register('stateCode')} />
            </FormField>
            <FormField label="GSTIN" htmlFor="gstin" error={errors.gstin?.message} hint="Leave blank to use the organization GSTIN.">
              <Input className="uppercase" maxLength={15} {...form.register('gstin')} />
            </FormField>
            <FormField label="Drug licence no." htmlFor="drugLicenseNo" error={errors.drugLicenseNo?.message}>
              <Input {...form.register('drugLicenseNo')} />
            </FormField>
            <FormField label="Drug licence expiry" htmlFor="drugLicenseExpiry" error={errors.drugLicenseExpiry?.message}>
              <Input type="date" {...form.register('drugLicenseExpiry', { setValueAs: (v) => (v ? new Date(v) : undefined) })} defaultValue={outlet?.drugLicenseExpiry ? outlet.drugLicenseExpiry.slice(0, 10) : ''} />
            </FormField>
            <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
              <Input type="tel" {...form.register('phone', { setValueAs: (v) => v || undefined })} />
            </FormField>
            <FormField label="Email" htmlFor="email" error={errors.email?.message}>
              <Input type="email" {...form.register('email', { setValueAs: (v) => v || undefined })} />
            </FormField>
            <FormField label="Default printer" htmlFor="settings.defaultPrinter">
              <Select {...form.register('settings.defaultPrinter')}>
                <option value="a4">A4 invoice</option>
                <option value="thermal80">Thermal 80mm</option>
                <option value="thermal58">Thermal 58mm</option>
              </Select>
            </FormField>
            <FormField label="Address line 1" htmlFor="address.line1" className="sm:col-span-2">
              <Input {...form.register('address.line1')} />
            </FormField>
            <FormField label="City" htmlFor="address.city">
              <Input {...form.register('address.city')} />
            </FormField>
            <FormField label="PIN code" htmlFor="address.pincode">
              <Input inputMode="numeric" {...form.register('address.pincode')} />
            </FormField>
            <FormField label="Business hours" htmlFor="settings.businessHours" className="sm:col-span-2" hint="Free text, e.g. Mon–Sat 9:00–21:00; available to document templates.">
              <Input {...form.register('settings.businessHours')} />
            </FormField>
            <FormField label="Invoice footer note" htmlFor="settings.invoiceFooterNote" className="sm:col-span-2" hint="Printed at the bottom of this outlet's invoices.">
              <Input {...form.register('settings.invoiceFooterNote')} />
            </FormField>
          </FormGrid>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {outlet ? 'Save changes' : 'Create outlet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OutletsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const outlets = useOutlets(showArchived);
  const archive = useArchiveOutlet();
  const canManage = usePermission('outlets.manage');
  const me = useSession((s) => s.me)!;
  const [editing, setEditing] = useState<OutletDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState<OutletDto | null>(null);

  const limit = me.organization.subscription.limits.outlets;
  const activeCount = outlets.data?.filter((o) => o.status !== 'archived').length ?? 0;

  return (
    <>
      <PageHeader
        title="Outlets"
        description={`${activeCount} of ${limit} outlets on your plan.`}
        actions={
          <>
            <label className="flex items-center gap-2 text-[13px] text-fg-muted">
              <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
            {canManage ? (
              <Button onClick={() => { setEditing(null); setDialogOpen(true); }} disabled={activeCount >= limit}>
                <Plus className="h-4 w-4" /> New outlet
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        {outlets.isPending ? (
          <TableSkeleton />
        ) : outlets.isError ? (
          <ErrorState message={errorMessage(outlets.error)} onRetry={() => outlets.refetch()} />
        ) : outlets.data.length === 0 ? (
          <EmptyState icon={Store} title="No outlets" description="Create your first outlet to start operating." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Outlet</TH>
                <TH>Code</TH>
                <TH>Type</TH>
                <TH>State</TH>
                <TH>Drug licence</TH>
                <TH>Status</TH>
                {canManage ? <TH className="w-12"><span className="sr-only">Actions</span></TH> : null}
              </TR>
            </THead>
            <TBody>
              {outlets.data.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <div className="font-medium">{o.name}</div>
                    {o.address?.city ? <div className="text-[12px] text-fg-subtle">{o.address.city}</div> : null}
                  </TD>
                  <TD><code className="rounded bg-surface-subtle px-1.5 py-0.5 text-[12px]">{o.code}</code></TD>
                  <TD className="capitalize">{o.type}</TD>
                  <TD>{o.stateCode}</TD>
                  <TD>
                    {o.drugLicenseNo ? (
                      <span>
                        {o.drugLicenseNo}
                        {o.drugLicenseExpiry ? <span className="block text-[12px] text-fg-subtle">Expires {formatDate(o.drugLicenseExpiry)}</span> : null}
                      </span>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={o.status} />
                      {o.isDefault ? <Badge variant="primary">Default</Badge> : null}
                    </div>
                  </TD>
                  {canManage ? (
                    <TD>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${o.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled={o.status === 'archived'} onSelect={() => { setEditing(o); setDialogOpen(true); }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem destructive disabled={o.isDefault || o.status === 'archived'} onSelect={() => setArchiving(o)}>Archive</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <OutletDialog open={dialogOpen} onOpenChange={setDialogOpen} outlet={editing} />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archive ${archiving?.name}?`}
        description="The outlet is hidden from switchers and reports going forward. Existing documents and stock history are preserved. You can still view it with “Show archived”."
        confirmLabel="Archive outlet"
        destructive
        loading={archive.isPending}
        onConfirm={() => {
          if (!archiving) return;
          archive.mutate(archiving.id, {
            onSuccess: () => { toast.success('Outlet archived'); setArchiving(null); },
            onError: (err) => toast.error(errorMessage(err)),
          });
        }}
      />
    </>
  );
}
