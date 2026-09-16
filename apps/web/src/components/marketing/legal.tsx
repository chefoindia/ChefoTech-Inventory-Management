import type { ReactNode } from 'react';
import Link from 'next/link';
import { SITE } from '@/lib/site';
import { Container, Section, Heading, Breadcrumbs } from './sections';
import { JsonLd, breadcrumbJsonLd } from './json-ld';

/** Shared frame for legal pages: breadcrumb, title, effective date and a readable single column. */
export function LegalPage({ title, path, effective, intro, children }: { title: string; path: string; effective: string; intro: string; children: ReactNode }) {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: title, path }])} />
      <section className="border-b border-border">
        <Container narrow className="pb-10 pt-10 sm:pt-16">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: title }]} />
          <Heading align="left" as="h1" className="mt-6" title={title} lead={intro} />
          <p className="mt-3 text-[13px] text-fg-subtle">Effective {effective}. Applies to {SITE.product}, a {SITE.company} product.</p>
        </Container>
      </section>
      <Section>
        <Container narrow className="prose-legal space-y-8 text-[15px] leading-relaxed text-fg-muted">{children}</Container>
      </Section>
    </>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function ContactLine() {
  return (
    <p>
      Questions about this policy: use the <Link href="/contact" className="font-medium text-primary-700 hover:underline">contact form</Link>
      {SITE.contact.email ? <> or email <a href={`mailto:${SITE.contact.email}`} className="font-medium text-primary-700 hover:underline">{SITE.contact.email}</a></> : null}.
    </p>
  );
}
