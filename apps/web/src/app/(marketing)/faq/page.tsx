import type { Metadata } from 'next';
import { og } from '@/lib/site';
import Link from 'next/link';
import { FAQ } from '@/content/faq';
import { Container, Section, Heading, FaqList, CtaBand, Breadcrumbs } from '@/components/marketing/sections';
import { JsonLd, faqJsonLd, breadcrumbJsonLd } from '@/components/marketing/json-ld';

export const metadata: Metadata = {
  title: 'FAQ · Pharmacy software questions answered',
  description: 'Answers about PharmaOS: batches and expiry, loose tablets, GST, customer credit (Baki), barcodes, invoice reading, PDF invoices, AI, multiple outlets and security.',
  alternates: { canonical: '/faq' },
  ...og('PharmaOS FAQ', 'Real questions pharmacies ask before choosing software.', '/faq'),
};

const TOPICS: { key: (typeof FAQ)[number]['topics'][number]; label: string }[] = [
  { key: 'general', label: 'Getting started' },
  { key: 'billing', label: 'Billing & POS' },
  { key: 'inventory', label: 'Inventory & expiry' },
  { key: 'purchases', label: 'Purchases & suppliers' },
  { key: 'customers', label: 'Customers & credit' },
  { key: 'outlets', label: 'Multiple outlets' },
  { key: 'documents', label: 'Invoices & documents' },
  { key: 'ai', label: 'AI assistant' },
  { key: 'security', label: 'Security & data' },
];

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(FAQ.map((f) => ({ q: f.q, a: f.a })))} />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'FAQ', path: '/faq' }])} />
      <section className="border-b border-border">
        <Container className="pb-10 pt-10 sm:pt-16" narrow>
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'FAQ' }]} />
          <Heading align="left" as="h1" className="mt-6" eyebrow="FAQ" title="Questions pharmacies ask before choosing software" lead="Short, factual answers about what PharmaOS does today. If yours is not here, ask us." />
          <nav aria-label="FAQ topics" className="mt-6 flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <a key={t.key} href={`#${t.key}`} className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-fg-muted hover:border-primary-300 hover:text-fg">
                {t.label}
              </a>
            ))}
          </nav>
        </Container>
      </section>
      <Section>
        <Container narrow className="space-y-12">
          {TOPICS.map((t) => {
            const items = FAQ.filter((f) => f.topics[0] === t.key);
            if (!items.length) return null;
            return (
              <div key={t.key} id={t.key} className="scroll-mt-24">
                <h2 className="text-lg font-semibold text-fg">{t.label}</h2>
                <FaqList className="mt-4" items={items.map((f) => ({ q: f.q, a: f.a }))} />
              </div>
            );
          })}
          <p className="text-center text-[14px] text-fg-muted">
            Still have a question? <Link href="/contact" className="font-medium text-primary-700 hover:underline">Contact ChefoTech</Link> or <Link href="/demo" className="font-medium text-primary-700 hover:underline">book a demo</Link>.
          </p>
        </Container>
      </Section>
      <CtaBand source="faq" />
    </>
  );
}
