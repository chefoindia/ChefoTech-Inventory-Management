import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-4', {
  variants: {
    variant: {
      neutral: 'border-border bg-surface-subtle text-fg-muted',
      primary: 'border-primary-200 bg-primary-50 text-primary-800',
      success: 'border-success-600/20 bg-success-50 text-success-700',
      warning: 'border-warning-600/20 bg-warning-50 text-warning-700',
      danger: 'border-danger-600/20 bg-danger-50 text-danger-700',
      info: 'border-info-600/20 bg-info-50 text-info-700',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeProps['variant']> = {
    active: 'success',
    inactive: 'neutral',
    archived: 'neutral',
    invited: 'info',
    suspended: 'danger',
    disabled: 'danger',
    sent: 'success',
    pending: 'warning',
    failed: 'danger',
    trialing: 'info',
  };
  return (
    <Badge variant={map[status] ?? 'neutral'} dot>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeProps['variant']> = { paid: 'success', partial: 'warning', credit: 'danger', unpaid: 'danger' };
  return (
    <Badge variant={map[status] ?? 'neutral'} dot>
      {status === 'credit' ? 'On credit' : status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

export function DocStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeProps['variant']> = { draft: 'neutral', confirmed: 'info', partially_received: 'warning', received: 'success', cancelled: 'neutral', completed: 'success', held: 'info', pending_approval: 'warning', approved: 'success', rejected: 'danger', requested: 'info', dispatched: 'warning', used: 'neutral', expired: 'danger', validated: 'info', committing: 'warning', committed: 'success', discarded: 'neutral', blocked: 'danger' };
  return (
    <Badge variant={map[status] ?? 'neutral'} dot>
      {status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}
    </Badge>
  );
}
