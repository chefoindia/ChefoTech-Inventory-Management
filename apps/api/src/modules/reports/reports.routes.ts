import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { reportQuerySchema, REPORT_CATALOGUE, REPORT_KEYS, type ReportKey, type ReportQuery } from '@pharmaos/shared';
import { validate, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { heavyRateLimit } from '@/middleware/rate-limit';
import { ok } from '@/lib/response';
import { hasPermission } from '@/lib/context';
import { ForbiddenError } from '@/lib/errors';
import { audit } from '@/services/audit.service';
import { runReport } from './reports.service';

export const reportsRouter = Router();
reportsRouter.use(authenticate, resolveOutlet);

reportsRouter.get('/catalogue', requirePermission('reports.view'), (req, res) => {
  const ctx = ctxOf(req);
  const canProfit = hasPermission(ctx, 'reports.viewProfit') || hasPermission(ctx, 'products.viewCost');
  ok(res, REPORT_CATALOGUE.filter((r) => !r.sensitive || canProfit));
});

const safe = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

reportsRouter.get('/:key', requirePermission('reports.view'), heavyRateLimit, validate({ params: z.object({ key: z.enum(REPORT_KEYS) }), query: reportQuerySchema }), async (req, res) => {
  const ctx = ctxOf(req);
  const key = params<{ key: ReportKey }>(req).key;
  const q = query<ReportQuery>(req);
  const result = await runReport(ctx, key, q);
  if (q.format === 'json') return ok(res, result);
  if (!hasPermission(ctx, 'reports.export')) throw new ForbiddenError('You cannot export reports');
  await audit(ctx, { action: 'report.exported', entityType: 'Report', summary: `Exported ${result.title} (${result.rows.length} rows) as ${q.format}` });
  const headers = result.columns.map((c) => c.label);
  const rows = result.rows.map((r) => result.columns.map((c) => { const v = r[c.key]; return c.format === 'money' && typeof v === 'number' ? (v / 100).toFixed(2) : safe(v ?? ''); }));
  const stamp = new Date().toISOString().slice(0, 10);
  if (q.format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(result.title.slice(0, 30));
    ws.addRow(headers).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${key}-${stamp}.xlsx"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${key}-${stamp}.csv"`);
  res.send('﻿' + Papa.unparse({ fields: headers, data: rows }));
});
