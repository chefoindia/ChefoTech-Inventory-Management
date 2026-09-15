'use client';

import * as React from 'react';
import type { CustomFieldDto, CustomFieldEntity } from '@pharmaos/shared';
import { useCustomFields } from '@/features/custom-fields/api';
import { FormField } from './form-field';
import { Input, Select, Textarea, Checkbox } from './input';
import { FileUpload, AttachmentList } from './file-upload';
import type { AttachmentRef } from '@pharmaos/shared';

/**
 * Renders the organization's custom fields for an entity as controlled inputs.
 * Values are a flat `key → value` object stored on the entity's `customFields`.
 */
export function CustomFieldsForm({ entity, values, onChange, errors = {}, entityId }: { entity: CustomFieldEntity; values: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void; errors?: Record<string, string>; entityId?: string }) {
  const fields = useCustomFields(entity);
  const list = (fields.data ?? []).filter((f) => f.status === 'active' && f.visibility.form).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!list.length) return null;
  const set = (k: string, v: unknown) => onChange({ ...values, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {list.map((f) => (
        <FormField key={f.id} label={f.label} htmlFor={`cf-${f.key}`} hint={f.helpText || undefined} error={errors[f.key]} required={f.required} className={f.type === 'longText' || f.type === 'file' || f.type === 'image' ? 'sm:col-span-2' : undefined}>
          <CustomFieldInput field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} entityId={entityId} />
        </FormField>
      ))}
    </div>
  );
}

function CustomFieldInput({ field, value, onChange, entityId }: { field: CustomFieldDto; value: unknown; onChange: (v: unknown) => void; entityId?: string }) {
  const str = value === undefined || value === null ? '' : String(value);
  switch (field.type) {
    case 'longText':
      return <Textarea value={str} onChange={(e) => onChange(e.target.value)} maxLength={field.validation?.maxLength} />;
    case 'number':
      return <Input type="number" step={1} value={str} min={field.validation?.min} max={field.validation?.max} onChange={(e) => onChange(e.target.value === '' ? undefined : Math.trunc(Number(e.target.value)))} />;
    case 'decimal':
      return <Input type="number" step="any" value={str} min={field.validation?.min} max={field.validation?.max} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'date':
      return <Input type="date" value={str.slice(0, 10)} onChange={(e) => onChange(e.target.value || undefined)} />;
    case 'datetime':
      return <Input type="datetime-local" value={str.slice(0, 16)} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)} />;
    case 'boolean':
      return (
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {value ? 'Yes' : 'No'}
        </label>
      );
    case 'dropdown':
      return (
        <Select value={str} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Select…</option>
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    case 'multiSelect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2 rounded-[var(--radius-control)] border border-border p-2">
          {field.options.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-[13px]">
              <Checkbox checked={arr.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...arr, o.value] : arr.filter((v) => v !== o.value))} /> {o.label}
            </label>
          ))}
          {!field.options.length ? <span className="text-[12px] text-fg-subtle">No options configured</span> : null}
        </div>
      );
    }
    case 'email':
      return <Input type="email" value={str} onChange={(e) => onChange(e.target.value || undefined)} />;
    case 'phone':
      return <Input type="tel" value={str} onChange={(e) => onChange(e.target.value || undefined)} />;
    case 'url':
      return <Input type="url" value={str} onChange={(e) => onChange(e.target.value || undefined)} />;
    case 'file':
    case 'image': {
      const ref = value && typeof value === 'object' ? (value as AttachmentRef) : null;
      return (
        <div className="space-y-2">
          {ref ? <AttachmentList items={[ref]} onRemove={() => onChange(undefined)} /> : null}
          <FileUpload purpose={field.type === 'image' ? 'productImage' : 'productDocument'} entityId={entityId} accept={field.type === 'image' ? 'image/*' : undefined} onUploaded={(refs) => onChange(refs[0])} label={ref ? 'Replace' : 'Upload'} />
        </div>
      );
    }
    default:
      return <Input value={str} onChange={(e) => onChange(e.target.value || undefined)} maxLength={field.validation?.maxLength} pattern={field.validation?.pattern} />;
  }
}

/** Read-only rendering of custom field values (detail pages). */
export function CustomFieldsView({ entity, values }: { entity: CustomFieldEntity; values: Record<string, unknown> | undefined }) {
  const fields = useCustomFields(entity);
  const list = (fields.data ?? []).filter((f) => f.status === 'active');
  const present = list.filter((f) => values && values[f.key] !== undefined && values[f.key] !== null && values[f.key] !== '');
  if (!present.length) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
      {present.map((f) => {
        const v = values![f.key];
        let text: string;
        if (typeof v === 'boolean') text = v ? 'Yes' : 'No';
        else if (Array.isArray(v)) text = v.map((x) => f.options.find((o) => o.value === x)?.label ?? String(x)).join(', ');
        else if (v && typeof v === 'object') text = (v as AttachmentRef).originalName ?? 'File';
        else if (f.type === 'dropdown') text = f.options.find((o) => o.value === v)?.label ?? String(v);
        else text = String(v);
        return (
          <div key={f.id}>
            <dt className="text-[12px] font-medium text-fg-subtle">{f.label}</dt>
            <dd className="mt-0.5 text-sm text-fg">{text}</dd>
          </div>
        );
      })}
    </dl>
  );
}
