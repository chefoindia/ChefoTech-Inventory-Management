'use client';

import * as React from 'react';
import { Tabs as Radix } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Tabs = Radix.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof Radix.List>) {
  return <Radix.List className={cn('inline-flex items-center gap-1 border-b border-border w-full', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Radix.Trigger>) {
  return (
    <Radix.Trigger
      className={cn(
        '-mb-px inline-flex h-9 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-fg-subtle transition-colors hover:text-fg data-[state=active]:border-primary-600 data-[state=active]:text-fg',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof Radix.Content>) {
  return <Radix.Content className={cn('pt-4 focus:outline-none', className)} {...props} />;
}
