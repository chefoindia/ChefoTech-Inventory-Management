import type { Metadata } from 'next';
import { og } from '@/lib/site';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { SOLUTIONS, solutionBySlug } from '@/content/solutions';
import { FAQ } from '@/content/faq';
import { Container, Section, Heading, FeatureGrid, Screenshot, SplitFeature, FaqList, CtaBand, Breadcrumbs } from '@/components/marketing/sections';
import { TrackedLink } from '@/components/marketing/tracked-link';
import { LandingView } from '@/components/marketing/landing-view';
import { JsonLd, breadcrumbJsonLd } from '@/components/marketing/json-ld';
import { BarcodeSection } from '@/components/marketing/barcode-section';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const dynamicParams = false;

export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = solutionBySlug(slug);
  if (!s) return {};
  return {
    title: { absolute: s.metaTitle },
    description: s.description,
    alternates: { canonical: `/${s.slug}` },
    ...og(s.metaTitle, s.description, `/${s.slug}`),
  };
}

/** SEO landing pages for specific search intent. Each has unique copy, screenshots and FAQ. */
export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = solutionBySlug(slug);
  if (!s) notFound();
  const faq = s.faq.map((q) => FAQ.find((f) => f.q === q)).filter((f): f is (typeof FAQ)[number] => !!f);

  return (
    <>
      <LandingView event="feature_page_interaction" />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: s.title, path: `/${s.slug}` }])} />
      <section className="border-b border-border">
        <Container className="pb-12 pt-10 sm:pt-16">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Solutions' }, { label: s.eyebrow }]} />
          <div className="mt-6 grid items-center gap-10 lg:grid-cols-2">
            <div>
              <Heading align="left" as="h1" eyebrow={s.eyebrow} title={s.title} lead={s.lead} />
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <TrackedLink href="/register" eventProps={{ cta: `${s.slug}_get_started` }} className={cn(buttonVariants({ size: 'lg' }), 'px-6')}>
                  Get started free <ArrowRight className="h-4 w-4" aria-hidden />
                </TrackedLink>
                <TrackedLink href="/demo" eventProps={{ cta: `${s.slug}_demo` }} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-6')}>
                  Book a demo
                </TrackedLink>
              </div>
            </div>
            <Screenshot src={s.hero.image} alt={s.hero.imageAlt} priority sizes="(min-width: 1024px) 560px, 100vw" />
          </div>
        </Container>
      </section>

      <Section tone="muted">
        <Container>
          <Heading title="What you get" />
          <FeatureGrid items={s.highlights} />
        </Container>
      </Section>

      <Section className="space-y-16 sm:space-y-24">
        {s.sections.map((sec, i) => (
          <Container key={sec.title}>
            <SplitFeature eyebrow={sec.eyebrow} title={sec.title} body={sec.body} bullets={sec.bullets} image={sec.image} imageAlt={sec.imageAlt} flip={i % 2 === 1} />
          </Container>
        ))}
      </Section>

      {/* Counter-focused pages get the illustrated barcode walkthrough; it links back to /pharmacy-pos elsewhere. */}
      {(s.slug === 'pharmacy-pos' || s.slug === 'pharmacy-billing-software') ? <BarcodeSection tone="muted" cta={s.slug !== 'pharmacy-pos'} /> : null}

      <Section tone="muted">
        <Container narrow>
          <Heading title="Common questions" />
          <FaqList className="mt-10" items={faq.map((f) => ({ q: f.q, a: f.a }))} />
        </Container>
      </Section>

      <Section>
        <Container>
          <h2 className="text-lg font-semibold text-fg">Related</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {s.related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-fg-muted hover:border-primary-300 hover:text-fg">
                  {r.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <CtaBand source={s.slug} />
    </>
  );
}
