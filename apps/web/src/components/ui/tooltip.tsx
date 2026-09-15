'use client';

import * as React from 'react';
import { Tooltip as Radix } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Tooltip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactElement; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <Radix.Root>
      <Radix.Trigger asChild>{children}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          side={side}
          sideOffset={6}
          className={cn('z-50 max-w-xs rounded-[var(--radius-control)] bg-slate-900 px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-md')}
        >
          {content}
          <Radix.Arrow className="fill-slate-900" />
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
