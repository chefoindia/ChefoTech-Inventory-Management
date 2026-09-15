'use client';

import Link from 'next/link';
import { BarChart3, Lock, ArrowRight } from 'lucide-react';
import { useReportCatalogue } from '@/features/reports/api';
import { usePermission } from '@/features/auth/permissions';
import { PageHeader, SectionHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Badge } from '@/components/ui/badge';
import { errorMessage } from '@/lib/api-client';

export default function ReportsPage() {
  const catalogue = useReportCatalogue();
  const canProfit = usePermission('reports.viewProfit');
  if (catalogue.isPending) return <Spinner />;
  if (catalogue.isError) return <ErrorState message={errorMessage(catalogue.error)} onRetry={() => catalogue.refetch()} />;
  const groups = new Map<string, typeof catalogue.data>();
  for (const r of catalogue.data) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  return (
    <>
      <PageHeader title="Reports" description="Every report opens on screen and exports to CSV or Excel for the selected period and outlet." />
      {[...groups.entries()].map(([group, items]) => (
        <section key={group} className="mb-6">
          <SectionHeader title={group} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((r) => {
              const locked = r.sensitive && !canProfit;
              const inner = (
                <Card className={`h-full transition-colors ${locked ? 'opacity-60' : 'group-hover:border-primary-300'}`}>
                  <CardHeader className="border-0">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 text-primary-700">{locked ? <Lock className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}</span>
                      <CardTitle>{r.label}</CardTitle>
                      {r.sensitive ? <Badge variant="warning">Sensitive</Badge> : null}
                    </div>
                    <CardDescription className="mt-1">{r.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-[13px] text-fg-subtle">{locked ? 'Needs profit/cost visibility' : <span className="inline-flex items-center gap-1 text-primary-700">Open <ArrowRight className="h-3.5 w-3.5" /></span>}</CardContent>
                </Card>
              );
              return locked ? <div key={r.key}>{inner}</div> : <Link key={r.key} href={`/reports/${r.key}`} className="group">{inner}</Link>;
            })}
          </div>
        </section>
      ))}
    </>
  );
}
