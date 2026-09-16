import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SITE, og } from '@/lib/site';
import { ChefoTechMark } from '@/components/marketing/brand';
import { Container, Section, Heading, CheckList, CtaBand, Breadcrumbs } from '@/components/marketing/sections';
import { JsonLd, breadcrumbJsonLd } from '@/components/marketing/json-ld';

export const metadata: Metadata = {
  title: 'About ChefoTech · The company behind the product',
  description: 'ChefoTech builds practical business software. PharmaOS is its pharmacy management product: billing, inventory, purchases, credit, reports and an AI assistant.',
  alternates: { canonical: '/about' },
  ...og('About ChefoTech', 'The company behind PharmaOS.', '/about'),
};

export default function AboutPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'About ChefoTech', path: '/about' }])} />
      <section className="border-b border-border">
        <Container className="pb-10 pt-10 sm:pt-16" narrow>
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />
          <div className="mt-6"><ChefoTechMark size="lg" /></div>
          <Heading align="left" as="h1" className="mt-4" title="Business software people can depend on every day" lead="ChefoTech is a technology company that builds practical software for running a business. PharmaOS is its pharmacy management product line." />
        </Container>
      </section>
      <Section>
        <Container narrow className="space-y-10 text-[15px] leading-relaxed text-fg-muted">
          <div>
            <h2 className="text-xl font-semibold text-fg">What we build</h2>
            <p className="mt-3">ChefoTech develops focused products for specific kinds of work. Before PharmaOS, the company built an HRMS platform for managing people and payroll. PharmaOS applies the same approach to pharmacies: one system for the counter, the store room and the owner, designed with the people who use it.</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-fg">How we work</h2>
            <CheckList className="mt-3" items={['Everything on this website is in the product today; we do not sell roadmaps.', 'Money is stored to the paisa and documents keep a snapshot of prices, so history never changes under you.', 'Permissions and tenant isolation are enforced on the server, and every important action is audited.', 'Your data is exportable at any time as a complete JSON archive.', 'Plain language over jargon, in the product and on this site.']} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-fg">PharmaOS</h2>
            <p className="mt-3">PharmaOS covers pharmacy billing with GST, inventory with batches and expiry, purchases and goods receipt, customer credit and supplier payments, prescriptions, documents and templates, reports, multi-outlet management and an optional AI assistant powered by Google Gemini. It runs in a web browser on any device and is offered as a subscription with a free trial.</p>
            <Link href="/features" className="mt-3 inline-flex items-center gap-1 font-medium text-primary-700 hover:underline">See all features <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-fg">Contact</h2>
            <p className="mt-3">
              Sales, support and partnership questions: <Link href="/contact" className="font-medium text-primary-700 hover:underline">contact form</Link>
              {SITE.contact.email ? <>, <a href={`mailto:${SITE.contact.email}`} className="font-medium text-primary-700 hover:underline">{SITE.contact.email}</a></> : null}
              {SITE.contact.phone ? <> or <a href={`tel:${SITE.contact.phone.replace(/[^\d+]/g, '')}`} className="font-medium text-primary-700 hover:underline">{SITE.contact.phone}</a></> : null}.
              {SITE.contact.person ? <> Ask for {SITE.contact.person}.</> : null}
            </p>
            {SITE.contact.offices.length ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {SITE.contact.offices.map((o) => (
                  <address key={o.label} className="rounded-[var(--radius-card)] border border-border bg-surface p-4 not-italic">
                    <div className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">{o.label}</div>
                    {o.lines.map((l) => <div key={l} className="mt-1 text-[14px] text-fg">{l}</div>)}
                  </address>
                ))}
              </div>
            ) : null}
          </div>
        </Container>
      </Section>
      <CtaBand source="about" />
    </>
  );
}
