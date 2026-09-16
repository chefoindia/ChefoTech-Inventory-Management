'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CreditCard } from 'lucide-react';
import type { PlanDto, SubscriptionInvoiceDto } from '@pharmaos/shared';
import { useCreateCheckout, useConfirmCheckout, useSubscriptionInvoices } from './api';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/states';

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void };
}
declare global {
  interface Window { Razorpay?: new (o: RazorpayOptions) => { open: () => void } }
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error('Could not load the payment window. Check your connection and try again.')); };
      document.body.appendChild(s);
    });
  }
  return scriptPromise;
}

/** "Pay & activate" for a plan through Razorpay Checkout; the server verifies the signature before activating. */
export function PlanCheckoutButton({ plan, current }: { plan: PlanDto; current: boolean }) {
  const create = useCreateCheckout();
  const confirm = useConfirmCheckout();
  const [months, setMonths] = React.useState<1 | 12>(1);
  const [busy, setBusy] = React.useState(false);
  if (plan.priceMinorPerMonth === null) return <Button variant="secondary" size="sm" className="w-full" disabled>Contact sales</Button>;
  const price = months === 12 ? plan.priceMinorPerMonth * 10 : plan.priceMinorPerMonth;
  const pay = async () => {
    setBusy(true);
    try {
      await loadRazorpay();
      const checkout = await create.mutateAsync({ planKey: plan.key, months });
      const rz = new window.Razorpay!({
        key: checkout.keyId,
        amount: checkout.amountMinor,
        currency: checkout.currency,
        name: 'PharmaOS',
        description: checkout.description,
        order_id: checkout.orderId,
        prefill: checkout.prefill,
        theme: { color: '#2563eb' },
        handler: (r) => {
          confirm.mutate({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }, {
            onSuccess: (inv) => toast.success(`${plan.name} active until ${inv.periodEnd ? formatDate(inv.periodEnd) : '—'}`),
            onError: (err) => toast.error(errorMessage(err)),
          });
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.open();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="w-full space-y-2">
      <Select className="h-8 text-[12px]" value={months} onChange={(e) => setMonths(Number(e.target.value) as 1 | 12)} aria-label="Billing period">
        <option value={1}>Monthly · {money(plan.priceMinorPerMonth)}</option>
        <option value={12}>Yearly · {money(plan.priceMinorPerMonth * 10)} (2 months free)</option>
      </Select>
      <Button size="sm" className="w-full" loading={busy || confirm.isPending} onClick={() => void pay()}>
        <CreditCard className="h-3.5 w-3.5" /> {current ? `Renew · ${money(price)}` : `Pay & activate · ${money(price)}`}
      </Button>
    </div>
  );
}

export function SubscriptionInvoicesCard() {
  const invoices = useSubscriptionInvoices();
  const tone = (s: SubscriptionInvoiceDto['status']) => (s === 'paid' ? 'success' : s === 'failed' ? 'danger' : 'warning');
  return (
    <Card className="mt-8">
      <CardHeader><CardTitle>Plan payments</CardTitle><CardDescription>Every checkout attempt and what period it covered.</CardDescription></CardHeader>
      {invoices.isPending ? <TableSkeleton rows={3} cols={5} /> : !invoices.data?.length ? <p className="px-5 py-4 text-[13px] text-fg-subtle">No plan payments yet.</p> : (
        <Table>
          <THead><TR><TH>Number</TH><TH>Plan</TH><TH>Period</TH><TH numeric>Amount</TH><TH>Status</TH><TH>Payment id</TH></TR></THead>
          <TBody>
            {invoices.data.map((i) => (
              <TR key={i.id}>
                <TD className="font-medium">{i.number}<div className="text-[12px] text-fg-subtle">{formatDateTime(i.createdAt)}</div></TD>
                <TD className="capitalize">{i.planKey} · {i.months} mo</TD>
                <TD>{i.periodStart ? `${formatDate(i.periodStart)} – ${formatDate(i.periodEnd)}` : '—'}</TD>
                <TD numeric>{money(i.amountMinor)}</TD>
                <TD><Badge variant={tone(i.status)} dot>{i.status}</Badge>{i.failureReason ? <div className="text-[12px] text-danger-600">{i.failureReason}</div> : null}</TD>
                <TD className="font-mono text-[12px]">{i.providerPaymentId || '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
