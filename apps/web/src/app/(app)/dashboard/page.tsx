'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ShoppingCart, Truck, AlertTriangle, ClipboardList, TrendingUp, TrendingDown, Wallet, PackageSearch, CalendarClock, Boxes } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { useSession } from '@/stores/session';
import { useDashboard } from '@/features/dashboard/api';
import { usePermission } from '@/features/auth/permissions';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, Stat } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { Button, buttonVariants } from '@/components/ui/button';
import { DateRangePicker, defaultRange, rangeToQuery, type DateRange } from '@/components/ui/date-range';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { money, moneyCompact, pct } from '@/lib/format';
import { formatDate, relativeTime } from '@/lib/utils';
import { errorMessage } from '@/lib/api-client';
import { PAYMENT_METHOD_LABELS } from '@/components/ui/payment-lines';
import { AiDashboardCard } from '@/components/ai/assistant';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];

function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="text-fg-subtle">No prior period</span>;
  const change = ((current - previous) / previous) * 100;
  const up = change >= 0;
  return (
    <span className={up ? 'text-success-700' : 'text-danger-600'}>
      {up ? <TrendingUp className="mr-1 inline h-3.5 w-3.5" /> : <TrendingDown className="mr-1 inline h-3.5 w-3.5" />}
      {Math.abs(change).toFixed(1)}% vs previous period
    </span>
  );
}

export default function DashboardPage() {
  const me = useSession((s) => s.me)!;
  const activeOutletId = useSession((s) => s.activeOutletId);
  const [range, setRange] = useState<DateRange>(defaultRange(30));
  const canProfit = usePermission('dashboard.viewProfit');
  const summary = useDashboard(rangeToQuery(range));
  const activeOutlet = me.outlets.find((o) => o.id === activeOutletId);
  const trialEnds = me.organization.subscription.trialEndsAt;
  const d = summary.data;

  return (
    <>
      <PageHeader
        title={`Good day, ${me.user.name.split(' ')[0]}`}
        help="What does the dashboard show and what should I look at first each day?"
        description={activeOutlet ? `${me.organization.name} · ${activeOutlet.name}` : me.organization.name}
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      {me.organization.subscription.status === 'trialing' && trialEnds ? (
        <Alert variant="info" className="mb-5" title={`Trial plan · ends ${formatDate(trialEnds)}`} action={<Link href="/settings/subscription" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>View plans</Link>}>
          Everything is unlocked during the trial. Choose a plan before it ends to keep your data flowing.
        </Alert>
      ) : null}

      <div className="mb-5"><AiDashboardCard /></div>

      {!activeOutletId ? (
        <EmptyState icon={Boxes} title="No outlet selected" description="Pick an outlet from the switcher above to see its figures." />
      ) : summary.isError ? (
        <ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />
      ) : (
        <>
          {d?.alerts.length ? (
            <div className="mb-5 flex flex-wrap gap-2">
              {d.alerts.map((a) => (
                <Link key={a.type} href={a.href} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[13px] hover:bg-surface-subtle">
                  <AlertTriangle className={a.severity === 'danger' ? 'h-3.5 w-3.5 text-danger-600' : a.severity === 'warning' ? 'h-3.5 w-3.5 text-warning-600' : 'h-3.5 w-3.5 text-info-600'} />
                  <span>{a.title}</span>
                  <Badge variant={a.severity === 'danger' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info'}>{a.count}</Badge>
                </Link>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Revenue" value={d ? money(d.sales.revenueMinor) : <Skeleton className="h-7 w-24" />} hint={d ? <Delta current={d.sales.revenueMinor} previous={d.sales.previousRevenueMinor} /> : undefined} />
            <Stat label="Invoices" value={d ? d.sales.invoices : <Skeleton className="h-7 w-16" />} hint={d ? `Average bill ${money(d.sales.averageBillMinor)}` : undefined} />
            <Stat label="Today" value={d ? money(d.today.revenueMinor) : <Skeleton className="h-7 w-24" />} hint={d ? `${d.today.invoices} invoices · collected ${money(d.today.collectionsMinor)}` : undefined} />
            {canProfit && d?.profit ? (
              <Stat label="Gross profit" value={money(d.profit.grossProfitMinor)} hint={`Margin ${pct(d.profit.marginBps)}`} />
            ) : (
              <Stat label="Purchases" value={d ? money(d.purchases.valueMinor) : <Skeleton className="h-7 w-24" />} hint={d ? <Delta current={d.purchases.valueMinor} previous={d.purchases.previousValueMinor} /> : undefined} />
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Sales trend</CardTitle></CardHeader>
              <CardContent className="h-72">
                {!d ? <Skeleton className="h-full w-full" /> : d.trend.length === 0 ? <EmptyState title="No sales in this period" className="py-8" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={d.trend.map((t) => ({ ...t, label: formatDate(t.date, { day: '2-digit', month: 'short' }) }))} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => moneyCompact(v)} width={64} />
                      <ChartTooltip formatter={(v, name) => [money(Number(v)), String(name) === 'revenueMinor' ? 'Revenue' : 'Purchases']} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="revenueMinor" stroke="#2563eb" fill="url(#rev)" strokeWidth={2} />
                      <Area type="monotone" dataKey="purchasesMinor" stroke="#94a3b8" fill="transparent" strokeWidth={1.5} strokeDasharray="4 2" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Payment mix</CardTitle></CardHeader>
              <CardContent className="h-72">
                {!d ? <Skeleton className="h-full w-full" /> : d.paymentMix.length === 0 ? <EmptyState title="No payments yet" className="py-8" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={d.paymentMix} dataKey="amountMinor" nameKey="method" innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {d.paymentMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <ChartTooltip formatter={(v, name) => [money(Number(v)), PAYMENT_METHOD_LABELS[String(name) as keyof typeof PAYMENT_METHOD_LABELS] ?? String(name)]} contentStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {d ? (
                  <ul className="-mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-fg-subtle">
                    {d.paymentMix.map((p, i) => (
                      <li key={p.method} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ?? p.method}</li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat icon={Wallet} label="Receivables" value={d ? money(d.receivables.outstandingMinor) : null} hint={d ? `${d.receivables.customers} customers · overdue ${money(d.receivables.overdueMinor)}` : ''} href="/customers?hasBalance=true" />
            <MiniStat icon={Truck} label="Payables" value={d ? money(d.payables.outstandingMinor) : null} hint={d ? `${d.payables.suppliers} suppliers · overdue ${money(d.payables.overdueMinor)}` : ''} href="/suppliers?hasBalance=true" />
            <MiniStat icon={PackageSearch} label="Low stock" value={d ? d.inventory.lowStock : null} hint={d ? `${d.inventory.products} products stocked` : ''} href="/inventory?tab=low-stock" />
            <MiniStat icon={CalendarClock} label="Expiry" value={d ? d.inventory.nearExpiry : null} hint={d ? `${d.inventory.expired} expired batches${d.inventory.valuationCostMinor !== undefined ? ` · stock value ${moneyCompact(d.inventory.valuationCostMinor)}` : ''}` : ''} href="/inventory?tab=expiry" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Top products</CardTitle>
                <Link href="/reports/sales.byProduct" className="text-[13px] font-medium text-primary-700 hover:underline">Full report</Link>
              </CardHeader>
              {!d ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> : d.topProducts.length === 0 ? <EmptyState title="No sales yet" className="py-8" /> : (
                <div className="grid grid-cols-1 md:grid-cols-2">
                  <div className="h-56 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.topProducts.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 12 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <ChartTooltip formatter={(v) => [money(Number(v)), 'Revenue']} contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="revenueMinor" fill="#2563eb" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <THead><TR><TH>Product</TH><TH numeric>Qty</TH><TH numeric>Revenue</TH></TR></THead>
                    <TBody>
                      {d.topProducts.slice(0, 8).map((p) => (
                        <TR key={p.productId}><TD><Link href={`/products/${p.productId}`} className="hover:underline">{p.name}</Link></TD><TD numeric>{p.qtyBase}</TD><TD numeric>{money(p.revenueMinor)}</TD></TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </Card>

            <div className="space-y-5">
              {d && d.outlets.length > 1 ? (
                <Card>
                  <CardHeader><CardTitle>Outlets</CardTitle></CardHeader>
                  <ul className="divide-y divide-border">
                    {d.outlets.map((o) => (
                      <li key={o.outletId} className="flex items-center justify-between px-5 py-2 text-sm"><span>{o.name}</span><span className="tabular text-fg-muted">{money(o.revenueMinor)} · {o.invoices}</span></li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              <Card>
                <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  <Link href="/sales/pos" className={buttonVariants({ variant: 'primary', size: 'sm' })}><ShoppingCart className="h-4 w-4" /> New sale</Link>
                  <Link href="/purchases/new" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Truck className="h-4 w-4" /> New purchase</Link>
                  <Link href="/products/new" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Add product</Link>
                  <Link href="/customers?new=1" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Add customer</Link>
                </CardContent>
              </Card>
              <Card>
                <SectionHeaderInCard title="Recent activity" />
                {!d ? <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div> : d.recentActivity.length === 0 ? <EmptyState icon={ClipboardList} title="No activity yet" className="py-8" /> : (
                  <ul className="divide-y divide-border">
                    {d.recentActivity.map((log) => (
                      <li key={log.id} className="px-4 py-2.5">
                        <div className="truncate text-[13px] text-fg">{log.summary}</div>
                        <div className="text-[12px] text-fg-subtle">{log.user} · {relativeTime(log.at)}</div>
                      </li>
                    ))}
                    <li className="px-4 py-2">
                      <Link href="/settings/audit" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-700 hover:underline">View audit log <ArrowRight className="h-3.5 w-3.5" /></Link>
                    </li>
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SectionHeaderInCard({ title }: { title: string }) {
  return <CardHeader><CardTitle>{title}</CardTitle></CardHeader>;
}

function MiniStat({ icon: Icon, label, value, hint, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode | null; hint: string; href: string }) {
  return (
    <Link href={href} className="group">
      <Card className="flex items-center gap-3 px-4 py-3 transition-colors group-hover:border-primary-300">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-700"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium uppercase tracking-wide text-fg-subtle">{label}</span>
          <span className="block text-lg font-semibold tabular text-fg">{value ?? <Skeleton className="h-6 w-20" />}</span>
          <span className="block truncate text-[12px] text-fg-subtle">{hint}</span>
        </span>
        <Button variant="ghost" size="icon-sm" tabIndex={-1} aria-hidden><ArrowRight className="h-4 w-4" /></Button>
      </Card>
    </Link>
  );
}
