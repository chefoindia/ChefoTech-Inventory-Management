import { cn } from '@/lib/utils';

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight text-fg', className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-600 text-white" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v16M4 12h16" />
        </svg>
      </span>
      {!compact ? <span className="text-[15px]">PharmaOS</span> : null}
    </span>
  );
}
