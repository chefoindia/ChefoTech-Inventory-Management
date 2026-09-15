'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, CheckCircle2, Trash2 } from 'lucide-react';
import { IMPORT_ENTITIES, EXPORT_ENTITIES, type ImportEntity, type ExportEntity, type ImportJobDto } from '@pharmaos/shared';
import { useImports, useImportJob, useImportColumns, useCreateImport, useCommitImport, useDiscardImport } from '@/features/imports/api';
import { downloadFile } from '@/features/reports/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge, DocStatusBadge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableSkeleton, EmptyState } from '@/components/ui/states';
import { Alert } from '@/components/ui/alert';
import { DateRangePicker, defaultRange, rangeToQuery, type DateRange } from '@/components/ui/date-range';

const ENTITY_LABELS: Record<ImportEntity, string> = { products: 'Products', customers: 'Customers', suppliers: 'Suppliers', openingStock: 'Opening stock' };
const EXPORT_LABELS: Record<ExportEntity, string> = { products: 'Products', customers: 'Customers', suppliers: 'Suppliers', stock: 'Current stock', batches: 'Batches', sales: 'Sales invoices', purchases: 'Purchases', movements: 'Stock movements', ledger: 'Party ledger' };

/** Minimal CSV header parse for the mapping UI (the server does the full parse). */
function parseHeader(csv: string): string[] {
  const line = csv.split(/\r?\n/)[0] ?? '';
  const out: string[] = []; let cur = ''; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; }
  out.push(cur.trim());
  return out.filter(Boolean);
}

export default function DataPage() {
  return <Suspense><DataInner /></Suspense>;
}

function DataInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') ?? 'import';
  const canImport = usePermission('data.import');
  const canExport = usePermission('data.export');
  return (
    <>
      <PageHeader title="Import & export" description="Move data in from spreadsheets with validation and preview; export anything to CSV or Excel." />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/settings/data?tab=${v}`)}>
        <TabsList>{canImport ? <TabsTrigger value="import">Import</TabsTrigger> : null}{canExport ? <TabsTrigger value="export">Export</TabsTrigger> : null}</TabsList>
        {canImport ? <TabsContent value="import"><ImportTab initialEntity={(params.get('entity') as ImportEntity | null) ?? undefined} /></TabsContent> : null}
        {canExport ? <TabsContent value="export"><ExportTab /></TabsContent> : null}
      </Tabs>
    </>
  );
}

function ImportTab({ initialEntity }: { initialEntity?: ImportEntity }) {
  const [entity, setEntity] = useState<ImportEntity>(initialEntity && IMPORT_ENTITIES.includes(initialEntity) ? initialEntity : 'products');
  const columns = useImportColumns(entity);
  const create = useCreateImport();
  const commit = useCommitImport();
  const discard = useDiscardImport();
  const imports = useImports();
  const [file, setFile] = useState<File | null>(null);
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [strategy, setStrategy] = useState<'skip' | 'update' | 'fail'>('skip');
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useImportJob(jobId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);

  // auto-map headers that match a column key or label
  useEffect(() => {
    if (!columns.data || !headers.length) return;
    const m: Record<string, string> = {};
    for (const h of headers) {
      const hit = columns.data.find((c) => c.key.toLowerCase() === h.toLowerCase() || c.label.toLowerCase() === h.toLowerCase());
      if (hit) m[h] = hit.key;
    }
    setMapping(m);
  }, [columns.data, headers]);

  const onFile = async (f: File | null) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return toast.error('Upload a CSV file. Save your Excel sheet as CSV (UTF-8) first.');
    if (f.size > 5_000_000) return toast.error('File is larger than 5 MB.');
    const text = await f.text();
    setFile(f); setCsv(text); setHeaders(parseHeader(text)); setJobId(null);
  };
  const missingRequired = useMemo(() => (columns.data ?? []).filter((c) => c.required && !Object.values(mapping).includes(c.key)), [columns.data, mapping]);
  const validate = () => {
    if (!csv || !file) return;
    create.mutate({ entity, fileName: file.name, csv, mapping, duplicateStrategy: strategy }, { onSuccess: (j) => { setJobId(j.id); if (j.unknownHeaders.length) toast.warning(`Ignored columns: ${j.unknownHeaders.join(', ')}`); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  const j = job.data;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>1. Choose what to import</CardTitle><CardDescription>Download the template, fill it in your spreadsheet app and save as CSV.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select className="h-9 w-48" value={entity} onChange={(e) => { setEntity(e.target.value as ImportEntity); setFile(null); setCsv(''); setHeaders([]); setJobId(null); }} aria-label="Entity">{IMPORT_ENTITIES.map((e) => <option key={e} value={e}>{ENTITY_LABELS[e]}</option>)}</Select>
          <Button variant="secondary" size="sm" loading={downloading} onClick={async () => { setDownloading(true); try { await downloadFile(`/imports/template/${entity}`, `${entity}-template.csv`); } catch (e) { toast.error(errorMessage(e)); } finally { setDownloading(false); } }}><Download className="h-3.5 w-3.5" /> Download template</Button>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          <Button size="sm" onClick={() => inputRef.current?.click()}><Upload className="h-3.5 w-3.5" /> {file ? `Replace ${file.name}` : 'Upload CSV'}</Button>
          {file ? <span className="text-[13px] text-fg-subtle">{file.name} · {Math.round(file.size / 1024)} KB · {csv.split(/\r?\n/).filter(Boolean).length - 1} rows</span> : null}
        </CardContent>
        {columns.data ? (
          <CardContent className="border-t border-border pt-4">
            <div className="mb-2 text-[13px] font-medium">Expected columns</div>
            <div className="flex flex-wrap gap-1.5">{columns.data.map((c) => <Badge key={c.key} variant={c.required ? 'primary' : 'neutral'} title={c.description}>{c.label}{c.required ? ' *' : ''}</Badge>)}</div>
          </CardContent>
        ) : null}
      </Card>

      {headers.length ? (
        <Card>
          <CardHeader><CardTitle>2. Map columns</CardTitle><CardDescription>Match each column in your file to a PharmaOS field. Unmapped columns are ignored.</CardDescription></CardHeader>
          <Table>
            <THead><TR><TH>Column in file</TH><TH>Maps to</TH></TR></THead>
            <TBody>
              {headers.map((h) => (
                <TR key={h}>
                  <TD className="font-mono text-[13px]">{h}</TD>
                  <TD><Select className="h-8 w-64" value={mapping[h] ?? ''} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value) n[h] = e.target.value; else delete n[h]; return n; })} aria-label={`Map ${h}`}><option value="">Ignore</option>{(columns.data ?? []).map((c) => <option key={c.key} value={c.key}>{c.label}{c.required ? ' *' : ''}</option>)}</Select></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <CardContent className="flex flex-wrap items-center gap-3 border-t border-border">
            <span className="text-[13px]">If a record already exists</span>
            <Select className="h-8 w-44" value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)} aria-label="Duplicate strategy"><option value="skip">Skip the row</option><option value="update">Update it</option><option value="fail">Mark as error</option></Select>
            {missingRequired.length ? <span className="text-[12px] text-danger-600">Missing required: {missingRequired.map((c) => c.label).join(', ')}</span> : null}
          </CardContent>
          <CardFooter><Button loading={create.isPending} disabled={!!missingRequired.length} onClick={validate}><CheckCircle2 className="h-4 w-4" /> Validate file</Button></CardFooter>
        </Card>
      ) : null}

      {jobId ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle>3. Review & commit</CardTitle><CardDescription>Nothing is written until you commit. Fix errors in the file and re-upload if needed.</CardDescription></div>{j ? <DocStatusBadge status={j.status} /> : null}</CardHeader>
          {!j ? <TableSkeleton rows={4} cols={3} /> : (
            <>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><div className="text-[12px] text-fg-subtle">Rows</div><div className="text-xl font-semibold">{j.totalRows}</div></div>
                <div><div className="text-[12px] text-fg-subtle">Valid</div><div className="text-xl font-semibold text-success-700">{j.validRows}</div></div>
                <div><div className="text-[12px] text-fg-subtle">Duplicates</div><div className="text-xl font-semibold text-warning-700">{j.duplicateRows}</div></div>
                <div><div className="text-[12px] text-fg-subtle">Errors</div><div className="text-xl font-semibold text-danger-600">{j.invalidRows}</div></div>
              </CardContent>
              {j.error ? <Alert variant="danger" className="mx-5 mb-4">{j.error}</Alert> : null}
              {j.status === 'committed' ? <Alert variant="success" className="mx-5 mb-4" title={`Imported ${j.committedRows} rows`}>Done {j.committedAt ? formatDateTime(j.committedAt) : ''}.</Alert> : null}
              <div className="max-h-96 overflow-auto border-t border-border">
                <Table>
                  <THead><TR><TH>Row</TH><TH>Status</TH><TH>Preview</TH><TH>Problems</TH></TR></THead>
                  <TBody>
                    {j.rows.filter((r) => r.status !== 'valid').concat(j.rows.filter((r) => r.status === 'valid').slice(0, 20)).map((r) => (
                      <TR key={r.row}>
                        <TD className="text-fg-subtle">{r.row}</TD>
                        <TD>{r.status === 'valid' ? <Badge variant="success">Valid</Badge> : r.status === 'duplicate' ? <Badge variant="warning">Duplicate</Badge> : <Badge variant="danger">Error</Badge>}</TD>
                        <TD className="max-w-[420px] truncate text-[12px]">{Object.entries(r.preview).slice(0, 5).map(([k, v]) => `${k}: ${String(v ?? '')}`).join(' · ')}</TD>
                        <TD className="text-[12px] text-danger-600">{r.errors.join('; ')}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
              {j.status === 'validated' ? (
                <CardFooter>
                  <Button variant="ghost" loading={discard.isPending} onClick={() => discard.mutate(j.id, { onSuccess: () => { setJobId(null); toast.success('Import discarded'); }, onError: (e) => toast.error(errorMessage(e)) })}><Trash2 className="h-4 w-4" /> Discard</Button>
                  <Button loading={commit.isPending} disabled={j.validRows === 0 && !(strategy === 'update' && j.duplicateRows > 0)} onClick={() => commit.mutate(j.id, { onSuccess: (res) => toast.success(`Imported ${res.committedRows} rows`), onError: (e) => toast.error(errorMessage(e)) })}><CheckCircle2 className="h-4 w-4" /> Commit {j.validRows + (strategy === 'update' ? j.duplicateRows : 0)} rows</Button>
                </CardFooter>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Recent imports</CardTitle></CardHeader>
        {imports.isPending ? <TableSkeleton rows={3} cols={4} /> : !imports.data?.length ? <EmptyState icon={FileSpreadsheet} title="No imports yet" className="py-8" /> : (
          <Table>
            <THead><TR><TH>File</TH><TH>Entity</TH><TH numeric>Rows</TH><TH numeric>Imported</TH><TH>Status</TH><TH>By</TH><TH /></TR></THead>
            <TBody>
              {imports.data.map((i: ImportJobDto) => (
                <TR key={i.id}>
                  <TD className="font-medium">{i.fileName}</TD>
                  <TD>{ENTITY_LABELS[i.entity]}</TD>
                  <TD numeric>{i.totalRows}</TD>
                  <TD numeric>{i.committedRows}</TD>
                  <TD><DocStatusBadge status={i.status} /></TD>
                  <TD className="text-[12px] text-fg-subtle">{i.createdBy?.name ?? '—'} · {formatDateTime(i.createdAt)}</TD>
                  <TD>{i.status === 'validated' ? <Button variant="ghost" size="sm" onClick={() => setJobId(i.id)}>Review</Button> : null}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ExportTab() {
  const [range, setRange] = useState<DateRange>(defaultRange(30));
  const [format, setFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [busy, setBusy] = useState<string | null>(null);
  const dated: ExportEntity[] = ['sales', 'purchases', 'movements', 'ledger'];
  const run = async (entity: ExportEntity) => {
    setBusy(entity);
    try {
      const r = rangeToQuery(range);
      const qs = dated.includes(entity) ? `&from=${r.from}&to=${r.to}` : '';
      await downloadFile(`/exports/${entity}?format=${format}${qs}`, `${entity}.${format}`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Export data</CardTitle><CardDescription>Exports respect your permissions (cost and profit columns are included only when you may see them) and the active outlet where relevant.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select className="h-9 w-32" value={format} onChange={(e) => setFormat(e.target.value as typeof format)} aria-label="Format"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option></Select>
          <DateRangePicker value={range} onChange={setRange} />
          <span className="text-[12px] text-fg-subtle">Date range applies to sales, purchases, movements and ledger.</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORT_ENTITIES.map((e) => (
            <Button key={e} variant="secondary" className="justify-start" loading={busy === e} onClick={() => void run(e)}>{format === 'xlsx' ? <FileSpreadsheet className="h-4 w-4" /> : <Download className="h-4 w-4" />} {EXPORT_LABELS[e]}</Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
