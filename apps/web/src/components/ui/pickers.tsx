'use client';

import * as React from 'react';
import type { ProductSearchHit, CustomerDto, SupplierDto } from '@pharmaos/shared';
import { useProductSearch } from '@/features/catalog/api';
import { useCustomerSearch, useSuppliers } from '@/features/parties/api';
import { useDebounce } from '@/hooks/use-debounce';
import { Combobox, type ComboOption } from './combobox';
import { money } from '@/lib/format';

/** Async product picker; `withStock` adds batch availability at the active outlet. */
export function ProductPicker({ value, onChange, withStock = false, placeholder = 'Search product by name, generic or barcode…', autoFocus, id, disabled }: { value: string | null; onChange: (id: string | null, product?: ProductSearchHit) => void; withStock?: boolean; placeholder?: string; autoFocus?: boolean; id?: string; disabled?: boolean }) {
  const [q, setQ] = React.useState('');
  const dq = useDebounce(q, 200);
  const search = useProductSearch(dq, withStock);
  const [cache, setCache] = React.useState<Map<string, ProductSearchHit>>(new Map());
  React.useEffect(() => {
    if (search.data) setCache((c) => { const n = new Map(c); for (const p of search.data) n.set(p.id, p); return n; });
  }, [search.data]);
  const options: ComboOption<ProductSearchHit>[] = React.useMemo(() => {
    const list = search.data ?? (value && cache.get(value) ? [cache.get(value)!] : []);
    return list.map((p) => ({ value: p.id, label: p.name, description: [p.packLabel, p.manufacturer, withStock && p.stockBase !== undefined ? `Stock ${p.stockBase}` : null].filter(Boolean).join(' · '), meta: p }));
  }, [search.data, cache, value, withStock]);
  return (
    <Combobox<ProductSearchHit>
      id={id}
      value={value}
      onChange={(v, o) => onChange(v, o?.meta)}
      options={options}
      onSearch={setQ}
      loading={search.isFetching}
      placeholder={placeholder}
      emptyText={q ? 'No products match' : 'Type to search products'}
      autoFocus={autoFocus}
      disabled={disabled}
      clearable
      renderOption={(o) => (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate">{o.label}</span>
            <span className="block truncate text-[12px] text-fg-subtle">{o.description}</span>
          </span>
          <span className="tabular text-[12px] text-fg-muted">{money(o.meta!.pricing.mrpMinor)}</span>
        </span>
      )}
    />
  );
}

export function CustomerPicker({ value, onChange, placeholder = 'Search customer by name or phone…', id, autoFocus, disabled }: { value: string | null; onChange: (id: string | null, customer?: CustomerDto) => void; placeholder?: string; id?: string; autoFocus?: boolean; disabled?: boolean }) {
  const [q, setQ] = React.useState('');
  const dq = useDebounce(q, 200);
  const search = useCustomerSearch(dq);
  const [cache, setCache] = React.useState<Map<string, CustomerDto>>(new Map());
  React.useEffect(() => {
    if (search.data) setCache((c) => { const n = new Map(c); for (const p of search.data) n.set(p.id, p); return n; });
  }, [search.data]);
  const options: ComboOption<CustomerDto>[] = React.useMemo(() => {
    const list = search.data ?? (value && cache.get(value) ? [cache.get(value)!] : []);
    return list.map((c) => ({ value: c.id, label: c.name, description: [c.phone, c.balanceMinor ? `Balance ${money(c.balanceMinor)}` : null].filter(Boolean).join(' · '), meta: c }));
  }, [search.data, cache, value]);
  return <Combobox<CustomerDto> id={id} value={value} onChange={(v, o) => onChange(v, o?.meta)} options={options} onSearch={setQ} loading={search.isFetching} placeholder={placeholder} emptyText={q ? 'No customers match' : 'Type to search customers'} clearable autoFocus={autoFocus} disabled={disabled} />;
}

export function SupplierPicker({ value, onChange, id, disabled }: { value: string | null; onChange: (id: string | null, supplier?: SupplierDto) => void; id?: string; disabled?: boolean }) {
  const [q, setQ] = React.useState('');
  const dq = useDebounce(q, 200);
  const list = useSuppliers({ page: 1, pageSize: 20, q: dq || undefined, status: 'active' });
  const [cache, setCache] = React.useState<Map<string, SupplierDto>>(new Map());
  React.useEffect(() => {
    if (list.data) setCache((c) => { const n = new Map(c); for (const p of list.data.items) n.set(p.id, p); return n; });
  }, [list.data]);
  const options: ComboOption<SupplierDto>[] = React.useMemo(() => {
    const items = list.data?.items ?? [];
    const merged = value && !items.some((s) => s.id === value) && cache.get(value) ? [cache.get(value)!, ...items] : items;
    return merged.map((s) => ({ value: s.id, label: s.name, description: [s.gstin, s.phone, s.balanceMinor ? `Payable ${money(s.balanceMinor)}` : null].filter(Boolean).join(' · '), meta: s }));
  }, [list.data, cache, value]);
  return <Combobox<SupplierDto> id={id} value={value} onChange={(v, o) => onChange(v, o?.meta)} options={options} onSearch={setQ} loading={list.isFetching} placeholder="Select supplier…" emptyText="No suppliers" clearable disabled={disabled} />;
}
