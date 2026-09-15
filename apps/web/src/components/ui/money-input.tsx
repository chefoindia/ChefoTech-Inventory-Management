'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Value in minor units (paise). */
  value: number | null | undefined;
  onChange: (minor: number | null) => void;
  allowNegative?: boolean;
}

/** Rupee input that stores paise. Shows "185.00", emits 18500. */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(({ value, onChange, allowNegative, className, ...props }, ref) => {
  const [text, setText] = React.useState(value === null || value === undefined ? '' : (value / 100).toFixed(2));
  const lastEmitted = React.useRef(value);
  React.useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(value === null || value === undefined ? '' : (value / 100).toFixed(2));
      lastEmitted.current = value;
    }
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">₹</span>
      <input
        ref={ref}
        inputMode="decimal"
        className={cn(inputClass, 'pl-7 text-right tabular', className)}
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.-]/g, '');
          setText(raw);
          if (raw === '' || raw === '-' || raw === '.') { lastEmitted.current = null; onChange(null); return; }
          const n = Number(raw);
          if (!Number.isFinite(n) || (!allowNegative && n < 0)) return;
          const minor = Math.round(n * 100);
          lastEmitted.current = minor;
          onChange(minor);
        }}
        onBlur={() => { if (text !== '' && Number.isFinite(Number(text))) setText(Number(text).toFixed(2)); }}
        {...props}
      />
    </div>
  );
});
MoneyInput.displayName = 'MoneyInput';

interface QtyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  integer?: boolean;
  suffix?: string;
}

export const QtyInput = React.forwardRef<HTMLInputElement, QtyInputProps>(({ value, onChange, integer = true, suffix, className, ...props }, ref) => (
  <div className="relative">
    <input
      ref={ref}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      step={integer ? 1 : 0.01}
      className={cn(inputClass, 'text-right tabular', suffix && 'pr-12', className)}
      value={value === null || value === undefined ? '' : value}
      onChange={(e) => {
        if (e.target.value === '') return onChange(null);
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        onChange(integer ? Math.trunc(n) : n);
      }}
      {...props}
    />
    {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-fg-subtle">{suffix}</span> : null}
  </div>
));
QtyInput.displayName = 'QtyInput';

export function PercentInput({ value, onChange, className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | null | undefined; onChange: (bps: number | null) => void }) {
  return (
    <div className="relative">
      <input
        type="number"
        step={0.5}
        min={0}
        max={100}
        className={cn(inputClass, 'pr-7 text-right tabular', className)}
        value={value === null || value === undefined ? '' : value / 100}
        onChange={(e) => { if (e.target.value === '') return onChange(null); const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.round(n * 100)); }}
        {...props}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-fg-subtle">%</span>
    </div>
  );
}
