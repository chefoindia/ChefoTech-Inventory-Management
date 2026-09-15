'use client';

import * as React from 'react';
import type { ApiMeta } from '@pharmaos/shared';
import { cn } from '@/lib/utils';
import { Table, THead, TBody, TR, TH, TD, Pagination } from './table';
import { TableSkeleton, EmptyState, ErrorState } from './states';
import { errorMessage } from '@/lib/api-client';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  numeric?: boolean;
  className?: string;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  isPending?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  meta?: ApiMeta;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  empty?: { title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> };
  dense?: boolean;
  footer?: React.ReactNode;
  className?: string;
}

/** Server-paginated table with loading, empty and error states built in. */
export function DataTable<T>({ columns, rows, rowKey, isPending, isError, error, onRetry, meta, onPageChange, onRowClick, empty, dense, footer, className }: DataTableProps<T>) {
  if (isPending) return <TableSkeleton cols={Math.min(columns.length, 6)} />;
  if (isError) return <ErrorState message={errorMessage(error)} onRetry={onRetry} />;
  if (!rows || rows.length === 0) return <EmptyState icon={empty?.icon} title={empty?.title ?? 'Nothing here yet'} description={empty?.description} action={empty?.action} />;
  return (
    <div className={className}>
      <Table>
        <THead>
          <TR className={dense ? 'h-8' : undefined}>
            {columns.map((c) => (
              <TH key={c.key} numeric={c.numeric} className={c.className} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {rows.map((row, i) => (
            <TR key={rowKey(row)} interactive={!!onRowClick} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cn(dense && 'h-8')}>
              {columns.map((c) => (
                <TD key={c.key} numeric={c.numeric} className={cn(c.className, dense && 'py-1')}>
                  {c.cell(row, i)}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
        {footer}
      </Table>
      {meta && onPageChange ? <Pagination meta={meta} onPageChange={onPageChange} /> : null}
    </div>
  );
}

/** Small helper for list pages: page + query state with reset on filter change. */
export function useListState(initial: Record<string, string> = {}) {
  const [page, setPage] = React.useState(1);
  const [filters, setFiltersRaw] = React.useState<Record<string, string>>(initial);
  const setFilter = React.useCallback((key: string, value: string) => {
    setFiltersRaw((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);
  return { page, setPage, filters, setFilter, reset: () => { setFiltersRaw(initial); setPage(1); } };
}
