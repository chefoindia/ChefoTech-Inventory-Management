import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, Phone, MapPin, Clock, MessageCircle } from 'lucide-react';
import { SITE, og } from '@/lib/site';
import { Container, Section, Heading, Breadcrumbs } from '@/components/marketing/sections';
import { LeadForm } from '@/components/marketing/lead-form';
import { JsonLd, breadcrumbJsonLd } from '@/components/marketing/json-ld';

export const metadata: Metadata = {
  title: 'Contact ChefoTech · Sales and support',
  description: 'Contact the ChefoTech team about PharmaOS: pricing for your pharmacy or chain, a walkthrough, migration from another system, or any product question.',
  alternates: { canonical: '/contact' },
  ...og('Contact ChefoTech', 'Sales and product questions about PharmaOS.', '/contact'),
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const type = topic === 'sales' ? 'sales' : 'contact';
  const { contact } = SITE;
  const hasDetails = !!(contact.email || contact.phone || contact.whatsapp || contact.offices.length || contact.hours);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }])} />
      <section className="border-b border-border">
        <Container className="pb-10 pt-10 sm:pt-16">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} />
          <Heading align="left" as="h1" className="mt-6" eyebrow="Contact" title={type === 'sales' ? 'Talk to sales' : 'Contact ChefoTech'} lead={type === 'sales' ? 'Tell us about your pharmacy or chain and we will come back with the right plan and a walkthrough.' : 'Questions about the product, pricing, migration or support: send a message and a person from the ChefoTech team will reply.'} />
        </Container>
      </section>
      <Section>
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
            <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-8">
              <LeadForm type={type} submitLabel={type === 'sales' ? 'Send to sales' : 'Send message'} />
            </div>
            <aside className="space-y-6">
              {hasDetails ? (
                <div className="rounded-[var(--radius-card)] border border-border bg-surface-muted p-5">
                  <h2 className="text-[15px] font-semibold text-fg">Reach {SITE.company} directly</h2>
                  {contact.person ? <p className="mt-1 text-[13px] text-fg-muted">Ask for {contact.person}.</p> : null}
                  <ul className="mt-3 space-y-2.5 text-[14px] text-fg-muted">
                    {contact.phone ? <li className="flex items-start gap-2.5"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden /><span><a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="hover:text-fg hover:underline">{contact.phone}</a>{contact.altPhone ? <> <span className="text-fg-subtle">or</span> <a href={`tel:${contact.altPhone.replace(/[^\d+]/g, '')}`} className="hover:text-fg hover:underline">{contact.altPhone}</a></> : null}</span></li> : null}
                    {contact.whatsapp ? <li className="flex items-start gap-2.5"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden /><a href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-fg hover:underline">WhatsApp {contact.whatsapp}</a></li> : null}
                    {contact.email ? <li className="flex items-start gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden /><span><a href={`mailto:${contact.email}`} className="hover:text-fg hover:underline">{contact.email}</a> <span className="text-fg-subtle">for support</span></span></li> : null}
                    {contact.salesEmail && contact.salesEmail !== contact.email ? <li className="flex items-start gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden /><span><a href={`mailto:${contact.salesEmail}`} className="hover:text-fg hover:underline">{contact.salesEmail}</a> <span className="text-fg-subtle">for sales and partnerships</span></span></li> : null}
                    {contact.otherEmails.length ? <li className="flex items-start gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" aria-hidden /><span className="text-[13px]">Also: {contact.otherEmails.map((e, i) => <span key={e}>{i ? ', ' : ''}<a href={`mailto:${e}`} className="hover:text-fg hover:underline">{e}</a></span>)}</span></li> : null}
                    {contact.offices.map((o) => (
                      <li key={o.label} className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden /><span><span className="block text-[12px] font-medium text-fg-subtle">{o.label}</span>{o.lines.map((l) => <span key={l} className="block">{l}</span>)}</span></li>
                    ))}
                    {contact.hours ? <li className="flex items-start gap-2.5"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden /><span>{contact.hours}</span></li> : null}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <h2 className="text-[15px] font-semibold text-fg">Prefer to see it first?</h2>
                <p className="mt-1.5 text-[13px] text-fg-muted">Book a demo and we will walk you through billing, stock and reports on sample data, or start a free trial and try it on your own products.</p>
                <div className="mt-3 flex flex-col gap-2 text-[14px]">
                  <Link href="/demo" className="font-medium text-primary-700 hover:underline">Book a demo →</Link>
                  <Link href="/register" className="font-medium text-primary-700 hover:underline">Start free trial →</Link>
                </div>
              </div>
              <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <h2 className="text-[15px] font-semibold text-fg">Already a customer?</h2>
                <p className="mt-1.5 text-[13px] text-fg-muted">Use this same form and mention your organization name; account and billing changes are made from Settings inside the app.</p>
                <Link href="/login" className="mt-3 inline-block text-[14px] font-medium text-primary-700 hover:underline">Sign in →</Link>
              </div>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
