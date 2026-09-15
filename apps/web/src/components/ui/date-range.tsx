'use client';

import * as React from 'react';
import { Input, Select } from './input';
import { daysAgo, startOfMonth, dateInput } from '@/lib/format';

export interface DateRange {
  from: string;
  to: string;
}

const PRESETS: { key: string; label: string; range: () => DateRange }[] = [
  { key: 'today', label: 'Today', range: () => ({ from: dateInput(daysAgo(0)), to: dateInput(new Date()) }) },
  { key: '7d', label: 'Last 7 days', range: () => ({ from: dateInput(daysAgo(6)), to: dateInput(new Date()) }) },
  { key: '30d', label: 'Last 30 days', range: () => ({ from: dateInput(daysAgo(29)), to: dateInput(new Date()) }) },
  { key: 'month', label: 'This month', range: () => ({ from: dateInput(startOfMonth()), to: dateInput(new Date()) }) },
  { key: '90d', label: 'Last 90 days', range: () => ({ from: dateInput(daysAgo(89)), to: dateInput(new Date()) }) },
  { key: 'fy', label: 'This financial year', range: () => { const now = new Date(); const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-04-01`, to: dateInput(now) }; } },
];

export function defaultRange(days = 30): DateRange {
  return { from: dateInput(daysAgo(days - 1)), to: dateInput(new Date()) };
}

/** API expects ISO; `to` covers the whole day. */
export function rangeToQuery(r: DateRange) {
  return { from: r.from ? new Date(`${r.from}T00:00:00`).toISOString() : undefined, to: r.to ? new Date(`${r.to}T23:59:59.999`).toISOString() : undefined };
}

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [preset, setPreset] = React.useState('30d');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="h-8 w-44" value={preset} onChange={(e) => { setPreset(e.target.value); const p = PRESETS.find((x) => x.key === e.target.value); if (p) onChange(p.range()); }} aria-label="Date preset">
        {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        <option value="custom">Custom</option>
      </Select>
      <Input type="date" className="h-8 w-36" value={value.from} onChange={(e) => { setPreset('custom'); onChange({ ...value, from: e.target.value }); }} aria-label="From" />
      <span className="text-[12px] text-fg-subtle">to</span>
      <Input type="date" className="h-8 w-36" value={value.to} onChange={(e) => { setPreset('custom'); onChange({ ...value, to: e.target.value }); }} aria-label="To" />
    </div>
  );
}
