import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const styles = {
  info: { box: 'border-info-600/20 bg-info-50 text-info-700', Icon: Info },
  success: { box: 'border-success-600/20 bg-success-50 text-success-700', Icon: CheckCircle2 },
  warning: { box: 'border-warning-600/20 bg-warning-50 text-warning-700', Icon: AlertTriangle },
  danger: { box: 'border-danger-600/20 bg-danger-50 text-danger-700', Icon: AlertCircle },
};

export function Alert({
  variant = 'info',
  title,
  children,
  className,
  action,
}: {
  variant?: keyof typeof styles;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const { box, Icon } = styles[variant];
  return (
    <div role={variant === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-sm', box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <div className="font-medium">{title}</div> : null}
        {children ? <div className={cn(title && 'mt-0.5', 'text-[13px] opacity-90')}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
