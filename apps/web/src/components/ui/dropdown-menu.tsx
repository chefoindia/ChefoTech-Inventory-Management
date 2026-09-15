'use client';

import * as React from 'react';
import { DropdownMenu as Radix } from 'radix-ui';
import { cn } from '@/lib/utils';

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuGroup = Radix.Group;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[180px] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-[var(--shadow-popover)] focus:outline-none',
          className,
        )}
        {...props}
      />
    </Radix.Portal>
  );
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof Radix.Item> & { destructive?: boolean }) {
  return (
    <Radix.Item
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-subtle data-[disabled]:opacity-50',
        destructive ? 'text-danger-700 data-[highlighted]:bg-danger-50' : 'text-fg',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Radix.Label>) {
  return <Radix.Label className={cn('px-2 py-1.5 text-[12px] font-medium text-fg-subtle', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
