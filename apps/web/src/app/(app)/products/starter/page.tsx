'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Search, Sparkles, CheckCircle2, Pill } from 'lucide-react';
import { STARTER_CATEGORIES, type StarterCatalogueItem, type StarterCategory } from '@pharmaos/shared';
import { useStarterCatalogue, useAddStarterProducts } from '@/features/catalog/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Checkbox } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils';

export default function StarterCataloguePage() {
  const router = useRouter();
  const canCreate = usePermission('products.create');
  const list = useStarterCatalogue();
  const add = useAddStarterProducts();
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<StarterCategory | 'all'>('all');
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);

  const items = list.data ?? [];
  // Essentials are ticked to begin with, so a brand-new pharmacy can simply press the button.
  const picked = useMemo(() => {
    if (selected) return selected;
    return new Set(items.filter((m) => m.essential && !m.alreadyAdded).map((m) => m.key));
  }, [selected, items]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((m) => {
      if (category !== 'all' && m.category !== category) return false;
      if (!needle) return true;
      return [m.name, m.brandName, m.genericName, m.composition, m.manufacturer].some((v) => v.toLowerCase().includes(needle));
    });
  }, [items, q, category]);

  const selectable = visible.filter((m) => !m.alreadyAdded);
  const allVisibleSelected = selectable.length > 0 && selectable.every((m) => picked.has(m.key));
  const count = picked.size;

  const toggle = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };
  const setMany = (keys: string[], on: boolean) => {
    const next = new Set(picked);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    setSelected(next);
  };

  const submit = () => {
    if (!count) return;
    add.mutate([...picked], {
      onSuccess: (r) => {
        setDone({ added: r.added, skipped: r.skipped.length });
        setSelected(new Set());
        if (r.failed.length) toast.error(`${r.failed.length} could not be added: ${r.failed[0]!.reason}`);
        else toast.success(`${r.added} medicine${r.added === 1 ? '' : 's'} added to your catalogue.`);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  if (done) {
    return (
      <>
        <PageHeader title="Common medicines" help="What does adding common medicines do, and what should I do next?" />
        <Card className="mx-auto max-w-xl">
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold text-fg">{done.added} medicine{done.added === 1 ? '' : 's'} added</h2>
            <p className="mt-2 text-[14px] text-fg-muted">
              They are in your product list with pack sizes and GST filled in. Prices and batches arrive when you record your first purchase or enter opening stock.
              {done.skipped ? ` ${done.skipped} were already in your catalogue and were left alone.` : ''}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Link href="/products" className={buttonVariants({})}>See my products</Link>
              <Link href="/inventory/opening-stock" className={buttonVariants({ variant: 'secondary' })}>Enter opening stock</Link>
              <Button variant="ghost" onClick={() => setDone(null)}>Add more medicines</Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Common medicines"
        description="Tick what you stock and add them in one go, instead of typing each product by hand."
        help="What is this list of common medicines and what happens when I add them?"
        actions={
          <>
            <Link href="/products" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Back to products</Link>
            {canCreate ? <Link href="/products/new" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Add one manually</Link> : null}
          </>
        }
      />

      <Alert variant="info" className="mb-5" title="Check the details against your stock">
        Pack size, GST rate and schedule are the common case for each brand and stay editable. Prices are deliberately left blank: MRP and cost belong to a batch and arrive with your first purchase or opening stock.
      </Alert>

      {list.isPending ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="flex flex-wrap items-center gap-2 py-3">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
                <Input className="pl-9" placeholder="Search by brand, salt or maker…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search common medicines" />
              </div>
              <Button variant="secondary" size="sm" onClick={() => setMany(items.filter((m) => m.essential && !m.alreadyAdded).map((m) => m.key), true)}>
                <Sparkles className="h-3.5 w-3.5" /> Select the essentials
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            </CardContent>
          </Card>

          <nav aria-label="Categories" className="mb-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setCategory('all')} className={cn('rounded-full border px-3 py-1.5 text-[13px]', category === 'all' ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-border bg-surface text-fg-muted hover:text-fg')}>
              All ({items.length})
            </button>
            {STARTER_CATEGORIES.map((c) => {
              const n = items.filter((m) => m.category === c).length;
              if (!n) return null;
              return (
                <button key={c} type="button" onClick={() => setCategory(c)} className={cn('rounded-full border px-3 py-1.5 text-[13px]', category === c ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-border bg-surface text-fg-muted hover:text-fg')}>
                  {c} ({n})
                </button>
              );
            })}
          </nav>

          {visible.length === 0 ? (
            <EmptyState icon={Pill} title="Nothing matches" description="Try a different brand or salt name." />
          ) : (
            <Card>
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-[13px]">
                <label className="flex items-center gap-2 font-medium text-fg">
                  <Checkbox
                    checked={allVisibleSelected}
                    disabled={selectable.length === 0}
                    onChange={(e) => setMany(selectable.map((m) => m.key), e.target.checked)}
                    aria-label="Select all shown"
                  />
                  Select all shown ({selectable.length})
                </label>
                <span className="text-fg-subtle">{count} selected</span>
              </div>
              <ul className="divide-y divide-border">
                {visible.map((m) => <StarterRow key={m.key} item={m} checked={picked.has(m.key)} onToggle={() => toggle(m.key)} />)}
              </ul>
            </Card>
          )}

          <div className="sticky bottom-0 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface/95 px-4 py-3 shadow-[var(--shadow-popover)] backdrop-blur">
            <p className="text-[13px] text-fg-muted">
              <span className="font-semibold text-fg">{count}</span> medicine{count === 1 ? '' : 's'} selected. Nothing is saved until you press continue.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => router.push('/products')} disabled={add.isPending}>Cancel</Button>
              <Button onClick={submit} loading={add.isPending} disabled={!count || !canCreate}>
                <Check className="h-4 w-4" /> Continue and add {count || ''}
              </Button>
            </div>
          </div>
          {!canCreate ? <p className="mt-2 text-[13px] text-danger-600">Your role cannot create products. Ask an owner or manager to add these.</p> : null}
        </>
      )}
    </>
  );
}

function StarterRow({ item, checked, onToggle }: { item: StarterCatalogueItem; checked: boolean; onToggle: () => void }) {
  const disabled = item.alreadyAdded;
  return (
    <li>
      <label className={cn('flex cursor-pointer items-start gap-3 px-4 py-3', disabled && 'cursor-default opacity-60')}>
        <Checkbox className="mt-1" checked={checked && !disabled} disabled={disabled} onChange={onToggle} aria-label={`Add ${item.name}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-fg">{item.name}</span>
            {item.schedule !== 'none' && item.schedule !== 'OTC' ? <Badge variant="warning">Schedule {item.schedule}</Badge> : null}
            {item.essential ? <Badge variant="primary">Essential</Badge> : null}
            {disabled ? <Badge variant="success">Already added</Badge> : null}
          </span>
          <span className="mt-0.5 block text-[13px] text-fg-muted">{item.composition}</span>
          <span className="mt-0.5 block text-[12px] text-fg-subtle">
            {item.manufacturer} · {item.packLabel} · GST {item.gstRateBps / 100}%
          </span>
        </span>
      </label>
    </li>
  );
}
