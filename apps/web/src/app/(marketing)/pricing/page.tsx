import type { Metadata } from 'next';
import { og } from '@/lib/site';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { PLANS, FEATURE_LABELS, FEATURE_KEYS, type PlanKey } from '@pharmaos/shared';
import { Container, Section, Heading, FaqList, Breadcrumbs } from '@/components/marketing/sections';
import { TrackedLink } from '@/components/marketing/tracked-link';
import { LandingView } from '@/components/marketing/landing-view';
import { JsonLd, breadcrumbJsonLd } from '@/components/marketing/json-ld';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Pricing · Plans for one pharmacy to a chain',
  description: 'PharmaOS pricing: free 14-day trial with every feature, then Starter, Standard and Business plans per month with clear limits. Enterprise for large chains.',
  alternates: { canonical: '/pricing' },
  ...og('PharmaOS pricing', 'Simple monthly plans. Start free.', '/pricing'),
};

const ORDER: PlanKey[] = ['starter', 'standard', 'business', 'enterprise'];
const rupees = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmt = (n: number) => n.toLocaleString('en-IN');

const PRICING_FAQ = [
  { q: 'Is there a free trial?', a: 'Yes. Every new organization starts on a 14-day trial with all features, up to 3 outlets and 10 users. No card is needed. Choose a plan before the trial ends to keep going; your data stays.' },
  { q: 'How is billing done?', a: 'Plans are billed per organization, monthly or yearly (pay for 10 months, get 12), through Razorpay in Indian rupees. Invoices for your subscription are available in Settings → Subscription.' },
  { q: 'What happens if I go over a limit?', a: 'Limits on outlets, users, products and invoices per month are enforced by the platform. You will be told when you reach one and can upgrade from Settings; nothing is deleted.' },
  { q: 'Does the AI assistant cost extra?', a: 'The assistant is included in plans that have it enabled. It uses your organization\'s own Google Gemini API key, so Google bills the AI usage to you directly. You can set a monthly token limit.' },
  { q: 'Can I change or cancel my plan?', a: 'You can move between plans at any time from Settings → Subscription. Your data is never deleted when you change plans, and you can export your whole organization as JSON at any time.' },
];

export default function PricingPage() {
  return (
    <>
      <LandingView event="pricing_interaction" />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }])} />
      <section className="border-b border-border">
        <Container className="pb-10 pt-10 text-center sm:pt-16">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Pricing' }]} />
          <Heading as="h1" className="mt-6" eyebrow="Pricing" title="Simple plans, every feature on trial" lead="Start with a 14-day trial of everything. Pick a plan when you are ready; limits below are what the platform enforces." />
        </Container>
      </section>

      <Section>
        <Container>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {ORDER.map((key) => {
              const p = PLANS[key];
              const highlight = key === 'standard';
              const custom = p.priceMinorPerMonth === null;
              return (
                <div key={key} className={cn('flex flex-col rounded-[var(--radius-card)] border bg-surface p-6', highlight ? 'border-primary-400 shadow-[var(--shadow-popover)]' : 'border-border')}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">{p.name}</h2>
                    {highlight ? <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-800">Most chosen</span> : null}
                  </div>
                  <div className="mt-3">
                    {custom ? (
                      <div className="text-2xl font-semibold text-fg">Custom</div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-semibold text-fg">{rupees(p.priceMinorPerMonth!)}</span>
                        <span className="text-[13px] text-fg-subtle">/ month</span>
                      </div>
                    )}
                    <p className="mt-1 text-[13px] text-fg-muted">{p.description}</p>
                    {!custom ? <p className="mt-1 text-[12px] text-fg-subtle">Yearly: pay for 10 months, get 12.</p> : null}
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                    <dt className="text-fg-subtle">Outlets</dt><dd className="text-right font-medium text-fg tabular">{custom ? 'Custom' : fmt(p.limits.outlets)}</dd>
                    <dt className="text-fg-subtle">Users</dt><dd className="text-right font-medium text-fg tabular">{custom ? 'Custom' : fmt(p.limits.users)}</dd>
                    <dt className="text-fg-subtle">Products</dt><dd className="text-right font-medium text-fg tabular">{custom ? 'Custom' : fmt(p.limits.products)}</dd>
                    <dt className="text-fg-subtle">Invoices / month</dt><dd className="text-right font-medium text-fg tabular">{custom ? 'Custom' : fmt(p.limits.invoicesPerMonth)}</dd>
                    <dt className="text-fg-subtle">Storage</dt><dd className="text-right font-medium text-fg tabular">{custom ? 'Custom' : `${Math.round(p.limits.storageMb / 1024)} GB`}</dd>
                  </dl>
                  <ul className="mt-5 space-y-1.5 text-[13px] text-fg-muted">
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary-600" aria-hidden /> POS, inventory, batches, expiry, purchases, credit, reports</li>
                    {FEATURE_KEYS.filter((f) => p.features.includes(f)).map((f) => (
                      <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary-600" aria-hidden /> {FEATURE_LABELS[f]}</li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-6">
                    {custom ? (
                      <TrackedLink href="/contact?topic=sales" event="pricing_interaction" eventProps={{ plan: key, cta: 'talk_to_sales' }} className={cn(buttonVariants({ variant: 'secondary' }), 'w-full')}>
                        Talk to sales
                      </TrackedLink>
                    ) : (
                      <TrackedLink href="/register" event="pricing_interaction" eventProps={{ plan: key, cta: 'start_trial' }} className={cn(buttonVariants({ variant: highlight ? 'primary' : 'secondary' }), 'w-full')}>
                        Start free trial <ArrowRight className="h-4 w-4" aria-hidden />
                      </TrackedLink>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-center text-[13px] text-fg-subtle">
            Prices in Indian rupees, per organization. Every plan includes POS and billing, batch and expiry inventory, purchases and GRN, customer credit, supplier payments, GST invoices, PDF documents and the dashboard. The 14-day trial includes every feature with up to {PLANS.trial.limits.outlets} outlets and {PLANS.trial.limits.users} users.
          </p>
        </Container>
      </Section>

      <Section tone="muted">
        <Container narrow>
          <Heading title="Pricing questions" />
          <FaqList className="mt-10" items={PRICING_FAQ} />
          <p className="mt-6 text-center text-[14px] text-fg-muted">
            Need more outlets or a custom agreement? <Link href="/contact?topic=sales" className="font-medium text-primary-700 hover:underline">Talk to sales</Link> or <Link href="/demo" className="font-medium text-primary-700 hover:underline">book a demo</Link>.
          </p>
        </Container>
      </Section>
    </>
  );
}
