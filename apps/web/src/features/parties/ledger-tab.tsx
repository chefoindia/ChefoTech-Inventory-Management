'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Scale, FileText } from 'lucide-react';
import type { LedgerEntryDto } from '@pharmaos/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useLedgerAdjustment } from './api';

function usePartyLedger(partyType: 'customer' | 'supplier', id: string, page: number) {
  return useQuery({ queryKey: [`${partyType}s`, 'ledger', id, page], queryFn: () => api.getPaged<LedgerEntryDto>(`/${partyType}s/${id}/ledger`, { page, pageSize: 25 }), placeholderData: (p) => p });
}
import { usePermission } from '@/features/auth/permissions';
import { openDocument } from '@/features/documents/api';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { formatDateTime } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { DateRangePicker, defaultRange, rangeToQuery, type DateRange } from '@/components/ui/date-range';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Textarea, Select } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';

/** Party ledger (debit/credit running balance) with statement printing and manual adjustments. */
export function LedgerTab({ partyType, partyId, balanceMinor }: { partyType: 'customer' | 'supplier'; partyId: string; balanceMinor: number }) {
  const [page, setPage] = React.useState(1);
  const ledger = usePartyLedger(partyType, partyId, page);
  const canAdjust = usePermission(partyType === 'customer' ? 'customers.adjustBalance' : 'suppliers.adjustBalance');
  const [range, setRange] = React.useState<DateRange>(defaultRange(90));
  const [adjOpen, setAdjOpen] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);
  const columns: Column<LedgerEntryDto>[] = [
    { key: 'date', header: 'Date', cell: (e) => formatDateTime(e.date) },
    { key: 'type', header: 'Entry', cell: (e) => <span className="capitalize">{e.type.replace(/_/g, ' ')}</span> },
    { key: 'ref', header: 'Reference', cell: (e) => e.refNumber || '—' },
    { key: 'note', header: 'Note', cell: (e) => <span className="text-[12px] text-fg-subtle">{e.note || '—'}</span> },
    { key: 'debit', header: 'Debit', numeric: true, cell: (e) => (e.debitMinor ? money(e.debitMinor) : '—') },
    { key: 'credit', header: 'Credit', numeric: true, cell: (e) => (e.creditMinor ? money(e.creditMinor) : '—') },
    { key: 'bal', header: 'Balance', numeric: true, cell: (e) => <span className={e.balanceAfterMinor > 0 ? 'font-medium text-danger-600' : 'font-medium'}>{money(e.balanceAfterMinor)}</span> },
    { key: 'by', header: 'By', cell: (e) => e.createdBy?.name ?? 'System' },
  ];
  const printStatement = async (download = false) => {
    setPrinting(true);
    try { const r = rangeToQuery(range); await openDocument(partyType === 'customer' ? 'customerStatement' : 'supplierStatement', partyId, { print: !download, download, from: r.from, to: r.to }); } catch (e) { toast.error(errorMessage(e)); } finally { setPrinting(false); }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <span className="text-sm">Balance <strong className={balanceMinor > 0 ? 'text-danger-600' : ''}>{money(balanceMinor)}</strong> <span className="text-[12px] text-fg-subtle">{partyType === 'customer' ? (balanceMinor > 0 ? 'receivable' : balanceMinor < 0 ? 'advance held' : '') : balanceMinor > 0 ? 'payable' : balanceMinor < 0 ? 'advance paid' : ''}</span></span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <Button variant="secondary" size="sm" loading={printing} onClick={() => void printStatement(false)}><FileText className="h-3.5 w-3.5" /> Statement</Button>
          <Button variant="ghost" size="sm" onClick={() => void printStatement(true)}>Download</Button>
          {canAdjust ? <Button variant="secondary" size="sm" onClick={() => setAdjOpen(true)}><Scale className="h-3.5 w-3.5" /> Adjust balance</Button> : null}
        </div>
      </div>
      <DataTable columns={columns} rows={ledger.data?.items} rowKey={(e) => e.id} isPending={ledger.isPending} isError={ledger.isError} error={ledger.error} meta={ledger.data?.meta} onPageChange={setPage} dense empty={{ title: 'No ledger entries yet' }} />
      <LedgerAdjustmentDialog partyType={partyType} partyId={partyId} open={adjOpen} onOpenChange={setAdjOpen} />
    </Card>
  );
}

function LedgerAdjustmentDialog({ partyType, partyId, open, onOpenChange }: { partyType: 'customer' | 'supplier'; partyId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const adjust = useLedgerAdjustment(partyType);
  const [direction, setDirection] = React.useState<'increase' | 'decrease'>('decrease');
  const [amount, setAmount] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => !adjust.isPending && onOpenChange(o)}>
      <DialogContent title="Manual ledger adjustment" description="For write-offs, opening corrections or discounts agreed outside an invoice. Every adjustment is audited." size="sm">
        <div className="space-y-4">
          <FormField label="Effect" htmlFor="la-dir"><Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}><option value="decrease">Reduce balance (write-off / discount)</option><option value="increase">Increase balance (charge)</option></Select></FormField>
          <FormField label="Amount" htmlFor="la-amt" required><MoneyInput value={amount} onChange={setAmount} autoFocus /></FormField>
          <FormField label="Reason" htmlFor="la-reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={adjust.isPending}>Cancel</Button>
          <Button loading={adjust.isPending} disabled={!amount || reason.trim().length < 3} onClick={() => adjust.mutate({ partyId, amountMinor: direction === 'increase' ? amount! : -amount!, reason }, { onSuccess: (r) => { toast.success(`Balance now ${money(r.balanceAfterMinor)}`); onOpenChange(false); setAmount(null); setReason(''); }, onError: (e) => toast.error(errorMessage(e)) })}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
