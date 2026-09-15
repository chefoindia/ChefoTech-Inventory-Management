'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, SlidersHorizontal, MoreHorizontal } from 'lucide-react';
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, type CustomFieldDto, type CustomFieldEntity, type CustomFieldType } from '@pharmaos/shared';
import { useCustomFields, useCreateCustomField, useUpdateCustomField, useArchiveCustomField } from '@/features/custom-fields/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Checkbox, Textarea } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableSkeleton, EmptyState } from '@/components/ui/states';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const ENTITY_LABELS: Record<CustomFieldEntity, string> = { product: 'Products', customer: 'Customers', supplier: 'Suppliers', user: 'Users', sale: 'Sales', purchase: 'Purchases' };
const TYPE_LABELS: Record<CustomFieldType, string> = { text: 'Text', longText: 'Long text', number: 'Whole number', decimal: 'Decimal', date: 'Date', datetime: 'Date & time', boolean: 'Yes / no', dropdown: 'Dropdown', multiSelect: 'Multi-select', email: 'Email', phone: 'Phone', url: 'URL', file: 'File', image: 'Image' };

export default function CustomFieldsPage() {
  const [entity, setEntity] = useState<CustomFieldEntity>('product');
  const [showArchived, setShowArchived] = useState(false);
  const fields = useCustomFields(entity, showArchived);
  const archive = useArchiveCustomField();
  const canManage = usePermission('settings.customFields');
  const [editing, setEditing] = useState<CustomFieldDto | null>(null);
  const [open, setOpen] = useState(false);
  const [archiving, setArchiving] = useState<CustomFieldDto | null>(null);
  const list = [...(fields.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <>
      <PageHeader title="Custom fields" description="Add your own fields to products, customers, suppliers, sales and purchases. They appear on forms, lists and printed documents as configured." actions={canManage ? <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> New field</Button> : null} />
      <Tabs value={entity} onValueChange={(v) => setEntity(v as CustomFieldEntity)}>
        <TabsList>{CUSTOM_FIELD_ENTITIES.map((e) => <TabsTrigger key={e} value={e}>{ENTITY_LABELS[e]}</TabsTrigger>)}</TabsList>
        <TabsContent value={entity}>
          <Card>
            <div className="flex items-center justify-end border-b border-border p-3"><label className="flex items-center gap-2 text-[13px] text-fg-muted"><Checkbox checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label></div>
            {fields.isPending ? <TableSkeleton rows={4} cols={5} /> : list.length === 0 ? <EmptyState icon={SlidersHorizontal} title={`No custom fields for ${ENTITY_LABELS[entity].toLowerCase()}`} description="Capture anything your business needs: rack, colour, salt group, referral source…" action={canManage ? <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> New field</Button> : undefined} /> : (
              <Table>
                <THead><TR><TH>Field</TH><TH>Key</TH><TH>Type</TH><TH>Required</TH><TH>Shown on</TH><TH numeric>Order</TH><TH>Status</TH>{canManage ? <TH className="w-10" /> : null}</TR></THead>
                <TBody>
                  {list.map((f) => (
                    <TR key={f.id}>
                      <TD><div className="font-medium">{f.label}</div>{f.helpText ? <div className="text-[12px] text-fg-subtle">{f.helpText}</div> : null}</TD>
                      <TD><code className="rounded bg-surface-subtle px-1.5 py-0.5 text-[12px]">{f.key}</code></TD>
                      <TD>{TYPE_LABELS[f.type]}{f.options.length ? <span className="block text-[12px] text-fg-subtle">{f.options.length} options</span> : null}</TD>
                      <TD>{f.required ? 'Yes' : '—'}</TD>
                      <TD className="space-x-1">{f.visibility.form ? <Badge>Form</Badge> : null}{f.visibility.list ? <Badge>List</Badge> : null}{f.visibility.print ? <Badge>Print</Badge> : null}</TD>
                      <TD numeric>{f.sortOrder}</TD>
                      <TD><StatusBadge status={f.status} /></TD>
                      {canManage ? <TD><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setEditing(f); setOpen(true); }}>Edit</DropdownMenuItem><DropdownMenuItem destructive disabled={f.status === 'archived'} onSelect={() => setArchiving(f)}>Archive</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TD> : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
      <FieldDialog open={open} onOpenChange={setOpen} field={editing} entity={entity} />
      <ConfirmDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)} title={`Archive “${archiving?.label}”?`} description="Existing values are kept on records but the field disappears from forms." confirmLabel="Archive" destructive loading={archive.isPending} onConfirm={() => { if (!archiving) return; archive.mutate(archiving.id, { onSuccess: () => { toast.success('Field archived'); setArchiving(null); }, onError: (e) => toast.error(errorMessage(e)) }); }} />
    </>
  );
}

function FieldDialog({ open, onOpenChange, field, entity }: { open: boolean; onOpenChange: (o: boolean) => void; field: CustomFieldDto | null; entity: CustomFieldEntity }) {
  const create = useCreateCustomField();
  const update = useUpdateCustomField();
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState('');
  const [helpText, setHelpText] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [visibility, setVisibility] = useState({ list: false, form: true, print: false });
  const [validation, setValidation] = useState<{ min?: number; max?: number; maxLength?: number; pattern?: string }>({});
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  useEffect(() => {
    if (!open) return;
    setLabel(field?.label ?? ''); setKey(field?.key ?? ''); setType(field?.type ?? 'text'); setRequired(field?.required ?? false); setOptions((field?.options ?? []).map((o) => (o.label === o.value ? o.label : `${o.label}=${o.value}`)).join('\n')); setHelpText(field?.helpText ?? ''); setSortOrder(field?.sortOrder ?? 0); setVisibility(field?.visibility ?? { list: false, form: true, print: false }); setValidation(field?.validation ?? {}); setStatus(field?.status ?? 'active');
  }, [open, field]);
  const pending = create.isPending || update.isPending;
  const parsedOptions = options.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [a, b] = l.split('='); return { label: a!.trim(), value: (b ?? a)!.trim() }; });
  const submit = () => {
    const base = { label, type, required, options: ['dropdown', 'multiSelect'].includes(type) ? parsedOptions : [], validation: Object.keys(validation).length ? validation : undefined, visibility, sortOrder, helpText };
    const fail = (e: unknown) => toast.error(errorMessage(e));
    if (field) update.mutate({ id: field.id, input: { ...base, status } }, { onSuccess: () => { toast.success('Field updated'); onOpenChange(false); }, onError: fail });
    else create.mutate({ ...base, entity, key }, { onSuccess: () => { toast.success('Field created'); onOpenChange(false); }, onError: fail });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent title={field ? `Edit ${field.label}` : `New field for ${ENTITY_LABELS[entity].toLowerCase()}`} size="lg">
        <div className="space-y-4">
          <FormGrid>
            <FormField label="Label" htmlFor="cf-label" required><Input value={label} onChange={(e) => { setLabel(e.target.value); if (!field) setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]/, 'f$&').slice(0, 40)); }} autoFocus /></FormField>
            <FormField label="Key" htmlFor="cf-key" required hint="Stored name; cannot change later."><Input value={key} onChange={(e) => setKey(e.target.value)} disabled={!!field} className="font-mono" /></FormField>
            <FormField label="Type" htmlFor="cf-type"><Select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)} disabled={!!field}>{CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</Select></FormField>
            <FormField label="Sort order" htmlFor="cf-order"><Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} /></FormField>
            {['dropdown', 'multiSelect'].includes(type) ? <FormField label="Options" htmlFor="cf-options" className="sm:col-span-2" hint="One per line. Use label=value to store a different value."><Textarea value={options} onChange={(e) => setOptions(e.target.value)} /></FormField> : null}
            {['number', 'decimal'].includes(type) ? <><FormField label="Minimum" htmlFor="cf-min"><Input type="number" value={validation.min ?? ''} onChange={(e) => setValidation((v) => ({ ...v, min: e.target.value === '' ? undefined : Number(e.target.value) }))} /></FormField><FormField label="Maximum" htmlFor="cf-max"><Input type="number" value={validation.max ?? ''} onChange={(e) => setValidation((v) => ({ ...v, max: e.target.value === '' ? undefined : Number(e.target.value) }))} /></FormField></> : null}
            {['text', 'longText'].includes(type) ? <><FormField label="Max length" htmlFor="cf-maxlen"><Input type="number" min={1} value={validation.maxLength ?? ''} onChange={(e) => setValidation((v) => ({ ...v, maxLength: e.target.value === '' ? undefined : Number(e.target.value) }))} /></FormField><FormField label="Pattern (regex)" htmlFor="cf-pattern"><Input value={validation.pattern ?? ''} onChange={(e) => setValidation((v) => ({ ...v, pattern: e.target.value || undefined }))} className="font-mono" /></FormField></> : null}
            <FormField label="Help text" htmlFor="cf-help" className="sm:col-span-2"><Input value={helpText} onChange={(e) => setHelpText(e.target.value)} /></FormField>
          </FormGrid>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required</label>
            <label className="flex items-center gap-2"><Checkbox checked={visibility.form} onChange={(e) => setVisibility((v) => ({ ...v, form: e.target.checked }))} /> Show on form</label>
            <label className="flex items-center gap-2"><Checkbox checked={visibility.list} onChange={(e) => setVisibility((v) => ({ ...v, list: e.target.checked }))} /> Show in lists</label>
            <label className="flex items-center gap-2"><Checkbox checked={visibility.print} onChange={(e) => setVisibility((v) => ({ ...v, print: e.target.checked }))} /> Available on documents</label>
            {field ? <label className="flex items-center gap-2"><Checkbox checked={status === 'active'} onChange={(e) => setStatus(e.target.checked ? 'active' : 'archived')} /> Active</label> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button loading={pending} disabled={!label.trim() || !key.trim()} onClick={submit}>{field ? 'Save' : 'Create field'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
