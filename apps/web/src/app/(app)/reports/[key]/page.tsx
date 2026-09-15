'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, ArrowLeft, RefreshCw } from 'lucide-react';
import { REPORT_CATALOGUE, type ReportKey, type ReportColumn } from '@pharmaos/shared';
import { useReport, downloadFile, reportExportPath } from '@/features/reports/api';
import { useCategories } from '@/features/catalog/api';
import { useOutlets } from '@/features/outlets/api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { money, pct } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { DateRangePicker, defaultRange, rangeToQuery, type DateRange } from '@/components/ui/date-range';
import { ProductPicker } from '@/components/ui/pickers';

function formatCell(value: string | number | null, col: ReportColumn): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (col.format) {
    case 'money': return money(Number(value));
    case 'percent': return pct(Number(value));
    case 'number': return typeof value === 'number' ? (Number.isInteger(value) ? value.toLocaleString('en-IN') : value.toFixed(2)) : String(value);
    case 'date': return typeof value === 'string' && value.length > 10 ? formatDateTime(value) : formatDate(String(value));
    default: return String(value);
  }
}

export default function ReportViewerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const meta = REPORT_CATALOGUE.find((r) => r.key === key);
  const canExport = usePermission('reports.export');
  const canProfit = usePermission('reports.viewProfit');
  const me = useSession((s) => s.me)!;
  const outlets = useOutlets();
  const categories = useCategories();
  const [range, setRange] = useState<DateRange>(defaultRange(30));
  const [outletId, setOutletId] = useState<string>('');
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [limit, setLimit] = useState(500);
  const [exporting, setExporting] = useState<string | null>(null);
  const reportParams = { ...(meta?.needsDates ? rangeToQuery(range) : {}), outletId: outletId || undefined, categoryId: categoryId || undefined, productId: productId ?? undefined, limit };
  const report = useReport(meta ? (key as ReportKey) : null, reportParams);
  const canAllOutlets = me.membership.outletAccess.all;

  if (!meta) return <EmptyState title="Unknown report" action={<Link href="/reports" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Back to reports</Link>} />;
  if (meta.sensitive && !canProfit) return <EmptyState title="This report needs profit visibility" description="Ask an administrator for the “view profit” permission." action={<Link href="/reports" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Back to reports</Link>} />;

  const exportAs = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    try { await downloadFile(reportExportPath(key as ReportKey, { ...reportParams, limit: 5000 }, format), `${key}.${format}`); } catch (e) { toast.error(errorMessage(e)); } finally { setExporting(null); }
  };
  const d = report.data;
  const showProduct = ['inventory.movements', 'sales.byProduct', 'inventory.batches'].includes(key);
  const showCategory = ['sales.byCategory', 'inventory.stock', 'inventory.valuation', 'sales.byProduct', 'inventory.lowStock', 'finance.profit'].includes(key);

  return (
    <>
      <PageHeader title={meta.label} description={<span className="flex items-center gap-2"><Link href="/reports" className="inline-flex items-center gap-1 text-primary-700 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> All reports</Link> · {meta.description}</span>} actions={canExport ? <><Button variant="secondary" size="sm" loading={exporting === 'csv'} onClick={() => void exportAs('csv')}><Download className="h-3.5 w-3.5" /> CSV</Button><Button variant="secondary" size="sm" loading={exporting === 'xlsx'} onClick={() => void exportAs('xlsx')}><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</Button></> : null} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          {meta.needsDates ? <DateRangePicker value={range} onChange={setRange} /> : null}
          {canAllOutlets && (outlets.data?.length ?? 0) > 1 ? <Select className="h-8 w-44" value={outletId} onChange={(e) => setOutletId(e.target.value)} aria-label="Outlet"><option value="">Current outlet</option>{key === 'sales.byOutlet' ? <option value="all">All outlets</option> : null}{outlets.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select> : null}
          {showCategory ? <Select className="h-8 w-44" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category"><option value="">All categories</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.path || c.name}</option>)}</Select> : null}
          {showProduct ? <div className="w-64"><ProductPicker value={productId} onChange={setProductId} placeholder="Any product" /></div> : null}
          <Select className="h-8 w-28" value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Row limit"><option value={100}>100 rows</option><option value={500}>500 rows</option><option value={2000}>2000 rows</option><option value={5000}>5000 rows</option></Select>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => report.refetch()} loading={report.isFetching}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
        </div>
        {report.isPending ? <TableSkeleton rows={8} cols={5} /> : report.isError ? <ErrorState message={errorMessage(report.error)} onRetry={() => report.refetch()} /> : !d || d.rows.length === 0 ? <EmptyState title="No data for this selection" description="Try a wider date range or a different outlet." /> : (
          <>
            <Table>
              <THead><TR>{d.columns.map((c) => <TH key={c.key} numeric={c.format === 'money' || c.format === 'number' || c.format === 'percent'}>{c.label}</TH>)}</TR></THead>
              <TBody>
                {d.rows.map((row, i) => (
                  <TR key={i} className="h-9">
                    {d.columns.map((c) => <TD key={c.key} numeric={c.format === 'money' || c.format === 'number' || c.format === 'percent'} className="py-1.5">{formatCell(row[c.key] ?? null, c)}</TD>)}
                  </TR>
                ))}
              </TBody>
              {d.totals ? (
                <tfoot className="border-t-2 border-border bg-surface-muted font-medium">
                  <tr>{d.columns.map((c, i) => <TD key={c.key} numeric={c.format === 'money' || c.format === 'number' || c.format === 'percent'}>{i === 0 && d.totals![c.key] === undefined ? 'Total' : d.totals![c.key] !== undefined ? formatCell(d.totals![c.key] ?? null, c) : ''}</TD>)}</tr>
                </tfoot>
              ) : null}
            </Table>
            <div className="border-t border-border px-4 py-2 text-[12px] text-fg-subtle">{d.meta.rowCount} rows · generated {formatDateTime(d.meta.generatedAt)}{d.meta.rowCount >= limit ? ' · limit reached, export for the full set' : ''}</div>
          </>
        )}
      </Card>
    </>
  );
}
