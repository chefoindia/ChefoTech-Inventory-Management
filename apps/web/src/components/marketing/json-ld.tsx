import { SITE, absoluteUrl } from '@/lib/site';

/** Renders a JSON-LD script. Data is our own static content, never user input. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export function organizationJsonLd() {
  const sameAs = Object.values(SITE.social).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.company,
    url: SITE.companyUrl ?? SITE.url,
    ...(SITE.companyLogo ? { logo: absoluteUrl(SITE.companyLogo) } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(SITE.contact.email ? { contactPoint: [{ '@type': 'ContactPoint', contactType: 'sales', email: SITE.contact.email, ...(SITE.contact.phone ? { telephone: SITE.contact.phone } : {}), availableLanguage: ['en', 'hi'] }] } : {}),
  };
}

export function softwareJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.product,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    url: SITE.url,
    description: SITE.description,
    publisher: { '@type': 'Organization', name: SITE.company },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR', description: '14-day free trial' },
    featureList: ['Pharmacy billing and GST invoices', 'Batch and expiry tracking', 'Purchase and goods receipt', 'Customer credit (Baki) ledger', 'Multi-outlet management', 'Reports and analytics', 'AI assistant (optional)'],
  };
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}
