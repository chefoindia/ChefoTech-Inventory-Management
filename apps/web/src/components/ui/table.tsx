import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ApiMeta } from '@pharmaos/shared';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto scroll-thin">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-[1] bg-surface-muted text-left text-[12px] font-medium uppercase tracking-wide text-fg-subtle', className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

export function TR({ className, interactive, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return <tr className={cn('h-10', interactive && 'cursor-pointer hover:bg-surface-muted', className)} {...props} />;
}

export function TH({ className, numeric, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <th scope="col" className={cn('px-4 py-2 font-medium whitespace-nowrap', numeric && 'text-right', className)} {...props} />;
}

export function TD({ className, numeric, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn('px-4 py-2 align-middle text-fg', numeric && 'text-right tabular', className)} {...props} />;
}

export function Pagination({ meta, onPageChange, className }: { meta: ApiMeta; onPageChange: (page: number) => void; className?: string }) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-between border-t border-border px-4 py-2 text-[13px] text-fg-subtle', className)}>
      <span>
        {from}–{to} of {meta.total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-1">
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
