'use client';

import * as React from 'react';
import { Popover } from 'radix-ui';
import { ChevronsUpDown, Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

export interface ComboOption<T = unknown> {
  value: string;
  label: string;
  description?: string;
  meta?: T;
}

interface ComboboxProps<T> {
  value: string | null;
  onChange: (value: string | null, option?: ComboOption<T>) => void;
  options: ComboOption<T>[];
  onSearch?: (q: string) => void;
  loading?: boolean;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  /** Custom row renderer. */
  renderOption?: (o: ComboOption<T>, active: boolean) => React.ReactNode;
  id?: string;
  autoFocus?: boolean;
}

/** Keyboard-navigable searchable select; `onSearch` enables async search. */
export function Combobox<T = unknown>({ value, onChange, options, onSearch, loading, placeholder = 'Select…', emptyText = 'No results', disabled, className, clearable, renderOption, id, autoFocus }: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;
  const [lastLabel, setLastLabel] = React.useState<string>('');
  React.useEffect(() => {
    if (selected) setLastLabel(selected.label);
  }, [selected]);
  const filtered = onSearch ? options : options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()) || (o.description ?? '').toLowerCase().includes(q.toLowerCase()));

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else setQ('');
  }, [open]);
  React.useEffect(() => setActive(0), [q, options]);

  const choose = (o: ComboOption<T>) => {
    onChange(o.value, o);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[active]; if (o) choose(o); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button id={id} type="button" disabled={disabled} autoFocus={autoFocus} className={cn(inputClass, 'items-center justify-between gap-2 text-left', !selected && 'text-fg-faint', className)} aria-haspopup="listbox" aria-expanded={open}>
          <span className="truncate">{selected?.label ?? (value ? lastLabel : '') ?? placeholder ?? placeholder}{!selected && !value ? placeholder : null}</span>
          <span className="flex items-center gap-1">
            {clearable && value ? (
              <X className="h-3.5 w-3.5 text-fg-faint hover:text-fg" onClick={(e) => { e.stopPropagation(); onChange(null); }} />
            ) : null}
            <ChevronsUpDown className="h-3.5 w-3.5 text-fg-faint" />
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[240px] rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-[var(--shadow-popover)]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="relative">
            <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); onSearch?.(e.target.value); }} onKeyDown={onKey} placeholder="Type to search…" className="h-8 w-full rounded-[4px] border border-border px-2 text-sm focus:border-primary-500" aria-label="Search options" />
            {loading ? <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-fg-faint" /> : null}
          </div>
          <ul role="listbox" className="mt-1 max-h-64 overflow-y-auto scroll-thin">
            {filtered.length === 0 ? <li className="px-2 py-2 text-[13px] text-fg-subtle">{loading ? 'Searching…' : emptyText}</li> : null}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                className={cn('flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5 text-sm', i === active ? 'bg-surface-subtle' : '')}
              >
                {renderOption ? renderOption(o, i === active) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.description ? <span className="block truncate text-[12px] text-fg-subtle">{o.description}</span> : null}
                  </span>
                )}
                {o.value === value ? <Check className="h-4 w-4 text-primary-700" /> : null}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
