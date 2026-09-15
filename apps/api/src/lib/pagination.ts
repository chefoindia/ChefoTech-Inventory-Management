import type { ApiMeta, PaginationQuery } from '@pharmaos/shared';

export interface PageOptions {
  skip: number;
  limit: number;
  sort: Record<string, 1 | -1>;
}

/**
 * Convert a validated pagination query into skip/limit/sort. `allowedSort` whitelists sortable
 * fields so clients cannot sort on unindexed or sensitive paths.
 */
export function pageOptions(
  query: PaginationQuery,
  allowedSort: string[],
  defaultSort: Record<string, 1 | -1> = { createdAt: -1 },
): PageOptions {
  let sort = defaultSort;
  if (query.sort) {
    const desc = query.sort.startsWith('-');
    const field = desc ? query.sort.slice(1) : query.sort;
    if (allowedSort.includes(field)) sort = { [field]: desc ? -1 : 1 };
  }
  return { skip: (query.page - 1) * query.pageSize, limit: query.pageSize, sort };
}

export function pageMeta(query: PaginationQuery, total: number): ApiMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** Escape user input before using it inside a RegExp (prefix searches). */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
