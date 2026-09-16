import type { Metadata } from 'next';
import { og } from '@/lib/site';
import Link from 'next/link';
import { Container, Section, Heading, CheckList, Breadcrumbs } from '@/components/marketing/sections';
import { LeadForm } from '@/components/marketing/lead-form';
import { JsonLd, breadcrumbJsonLd } from '@/components/marketing/json-ld';

export const metadata: Metadata = {
  title: 'Book a Demo · See it on sample pharmacy data',
  description: 'Request a live walkthrough of PharmaOS: billing, batch and expiry stock, purchases, customer credit, reports, multi-outlet and the AI assistant, on sample data or your own.',
  alternates: { canonical: '/demo' },
  ...og('Book a PharmaOS demo', 'A guided walkthrough with the ChefoTech team.', '/demo'),
};

export default function DemoPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Book a demo', path: '/demo' }])} />
      <section className="border-b border-border">
        <Container className="pb-10 pt-10 sm:pt-16">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Book a demo' }]} />
          <Heading align="left" as="h1" className="mt-6" eyebrow="Book a demo" title="See PharmaOS running before you decide" lead="Tell us a little about your pharmacy and the ChefoTech team will arrange a walkthrough on a video call, at a time that suits you." />
        </Container>
      </section>
      <Section>
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
            <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-8">
              <LeadForm type="demo" submitLabel="Request a demo" />
            </div>
            <aside className="space-y-6">
              <div className="rounded-[var(--radius-card)] border border-border bg-surface-muted p-5">
                <h2 className="text-[15px] font-semibold text-fg">What a demo covers</h2>
                <CheckList className="mt-3 text-[13px]" items={['Billing at the counter with batches, loose units and credit', 'Purchases, goods receipt and supplier dues', 'Inventory, expiry windows and reorder lists', 'Reports the owner reads daily', 'Multi-outlet setup and stock transfers', 'The AI assistant on real invoices and questions', 'Migration: importing products, customers and opening stock']} />
              </div>
              <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <h2 className="text-[15px] font-semibold text-fg">Rather try it yourself?</h2>
                <p className="mt-1.5 text-[13px] text-fg-muted">The 14-day trial has every feature and no card is needed. You can still book a demo later.</p>
                <Link href="/register" className="mt-3 inline-block text-[14px] font-medium text-primary-700 hover:underline">Start free trial →</Link>
              </div>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
