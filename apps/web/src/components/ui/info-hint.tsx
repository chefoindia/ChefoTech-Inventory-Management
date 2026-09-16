'use client';

import * as React from 'react';
import { Popover as Radix } from 'radix-ui';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Small "what is this for?" button next to a field label.
 *
 * A popover rather than a tooltip on purpose: it opens on tap as well as on click and keyboard,
 * so it works at the counter on a tablet. It is a plain button with `type="button"`, so it never
 * submits the form it sits in.
 */
export function InfoHint({ title, children, className, side = 'top' }: { title?: string; children: React.ReactNode; className?: string; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <Radix.Root>
      <Radix.Trigger asChild>
        <button
          type="button"
          aria-label={title ? `What is "${title}" for?` : 'What is this field for?'}
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-fg-faint transition-colors hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-500 data-[state=open]:text-primary-700',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          side={side}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-border bg-surface p-3 text-[12px] leading-relaxed text-fg-muted shadow-[var(--shadow-popover)]"
        >
          {title ? <p className="mb-1 text-[12px] font-semibold text-fg">{title}</p> : null}
          <div className="space-y-1.5">{children}</div>
          <Radix.Arrow className="fill-surface" width={12} height={6} />
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

/** Info button for a table column header or any label that is not a FormField. */
export function ColumnHint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {title}
      <InfoHint title={title}>{children}</InfoHint>
    </span>
  );
}
