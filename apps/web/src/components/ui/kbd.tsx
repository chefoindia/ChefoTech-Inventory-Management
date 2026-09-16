import * as React from 'react';
import { cn } from '@/lib/utils';

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn('inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-surface-subtle px-1 font-mono text-[11px] text-fg-muted', className)} {...props} />;
}
