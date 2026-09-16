import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './input';
import { InfoHint } from './info-hint';

/**
 * Wires label, hint and error to a control via aria attributes. The child control receives
 * `id`, `aria-invalid` and `aria-describedby`.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  info,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  /** Longer "what is this for?" explanation behind an info button next to the label. */
  info?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement<Record<string, unknown>>;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const injected = {
    id: htmlFor,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': required || undefined,
  };
  const render = children.props.render;
  // react-hook-form <Controller> renders the real control through `render`; inject into that element instead.
  const control =
    typeof render === 'function'
      ? React.cloneElement(children, { render: (...args: unknown[]) => React.cloneElement((render as (...a: unknown[]) => React.ReactElement<Record<string, unknown>>)(...args), injected) })
      : React.cloneElement(children, injected);
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* The info button sits beside the label, never inside it: a button within <label> would be
          read out as part of the field's own name by screen readers. */}
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-danger-600" aria-hidden>*</span> : null}
        </Label>
        {info ? <InfoHint title={label}>{info}</InfoHint> : null}
      </div>
      {control}
      {error ? (
        <p id={errorId} className="text-[12px] text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[12px] text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)} {...props} />;
}
