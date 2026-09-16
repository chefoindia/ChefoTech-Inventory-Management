/**
 * Brand and site configuration for the public website, auth screens and metadata.
 *
 * Company contact details are deliberately NOT hard-coded: they come from environment variables
 * so nothing is invented. Sections that need a detail (phone, address, social links) render only
 * when it is configured. See apps/web/.env.example.
 */

/** Reads an override. Unset → undefined (use the default); set to empty → '' (hide the item). */
const env = (key: string): string | undefined => {
  const v = process.env[key];
  return v === undefined ? undefined : v.trim();
};

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000') as string;

export const SITE = {
  /** Product name as it already exists in the application. */
  product: 'PharmaOS',
  /** Parent company / brand. */
  company: 'ChefoTech',
  byline: 'A ChefoTech product',
  tagline: 'Modern pharmacy management, simplified.',
  description:
    'PharmaOS by ChefoTech is pharmacy management software for billing, inventory, batches and expiry, purchases, customer credit (Baki), GST invoices, reports and multi-outlet control, with an optional AI assistant.',
  locale: 'en_IN',
  url: SITE_URL,
  /**
   * ChefoTech contact details, supplied by the company. Each one can still be overridden per
   * deployment through NEXT_PUBLIC_* variables; an empty override removes the item from the site.
   */
  contact: {
    person: env('NEXT_PUBLIC_CONTACT_PERSON') ?? 'Rakesh Biswal',
    phone: env('NEXT_PUBLIC_CONTACT_PHONE') ?? '+91 99381 79834',
    altPhone: env('NEXT_PUBLIC_CONTACT_ALT_PHONE') ?? '+91 97777 05759',
    whatsapp: env('NEXT_PUBLIC_CONTACT_WHATSAPP') ?? '+91 77354 76804',
    /** Primary, shown wherever a single address is needed. */
    email: env('NEXT_PUBLIC_CONTACT_EMAIL') ?? 'support@chefo.in',
    salesEmail: env('NEXT_PUBLIC_SALES_EMAIL') ?? 'contact@chefo.in',
    /** Other addresses the company also answers from. */
    otherEmails: (env('NEXT_PUBLIC_OTHER_EMAILS') ?? 'chefoindia25@gmail.com, rb2306114@gmail.com').split(',').map((e) => e.trim()).filter(Boolean),
    offices: [
      { label: 'Head office', lines: (env('NEXT_PUBLIC_OFFICE_1') ?? 'Jyotsna Enclave, beside Mayfair Lagoon|8B Jayadev Vihar, Bhubaneswar, Odisha, India').split('|') },
      { label: 'Second office', lines: (env('NEXT_PUBLIC_OFFICE_2') ?? 'In front of SIP Abacus, KIIT Square|Bhubaneswar, Odisha, India').split('|') },
    ].filter((o) => o.lines.some((l) => l.trim())),
    /** Single-line head office address for places with no room for two. */
    get address(): string {
      return this.offices[0]?.lines.join(', ') ?? '';
    },
    hours: env('NEXT_PUBLIC_SUPPORT_HOURS'),
    city: 'Bhubaneswar',
    region: 'Odisha',
    country: 'IN',
  },
  social: {
    linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN?.trim() || undefined,
    x: process.env.NEXT_PUBLIC_SOCIAL_X?.trim() || undefined,
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM?.trim() || undefined,
    youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE?.trim() || undefined,
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK?.trim() || undefined,
  },
  /** Parent company website, if different from this site. */
  companyUrl: process.env.NEXT_PUBLIC_COMPANY_URL?.trim() || undefined,
  /** The ChefoTech mark. Replace the file in apps/web/public/brand to update it everywhere. */
  companyLogo: env('NEXT_PUBLIC_COMPANY_LOGO') ?? '/brand/chefotech.svg',
  /** Google Search Console HTML-tag verification token, if any. */
  googleVerification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || undefined,
};

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;

/** Primary navigation for the public website. */
export const NAV = [
  { label: 'Features', href: '/features' },
  { label: 'Solutions', href: '/pharmacy-management-software', children: [
    { label: 'Pharmacy management software', href: '/pharmacy-management-software', blurb: 'The whole pharmacy on one platform' },
    { label: 'Pharmacy billing software', href: '/pharmacy-billing-software', blurb: 'GST invoices, split payments, credit' },
    { label: 'Pharmacy POS', href: '/pharmacy-pos', blurb: 'Fast counter billing with barcode scanning' },
    { label: 'Pharmacy inventory management', href: '/pharmacy-inventory-management', blurb: 'Batches, expiry, reorder, valuation' },
    { label: 'Software for multiple outlets', href: '/pharmacy-software-for-multiple-outlets', blurb: 'Branches, transfers, consolidated reports' },
  ] },
  { label: 'AI', href: '/ai-pharmacy-assistant' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
] as const;

export const FOOTER_LINKS = {
  product: [
    { label: 'Features', href: '/features' },
    { label: 'AI assistant', href: '/ai-pharmacy-assistant' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Request a demo', href: '/demo' },
  ],
  solutions: [
    { label: 'Pharmacy management software', href: '/pharmacy-management-software' },
    { label: 'Pharmacy billing software', href: '/pharmacy-billing-software' },
    { label: 'Pharmacy POS', href: '/pharmacy-pos' },
    { label: 'Inventory management', href: '/pharmacy-inventory-management' },
    { label: 'Multi-outlet pharmacies', href: '/pharmacy-software-for-multiple-outlets' },
  ],
  company: [
    { label: 'About ChefoTech', href: '/about' },
    { label: 'Contact', href: '/contact' },
    { label: 'Privacy policy', href: '/privacy' },
    { label: 'Terms of service', href: '/terms' },
    { label: 'Cookie policy', href: '/cookies' },
  ],
  account: [
    { label: 'Sign in', href: '/login' },
    { label: 'Start free trial', href: '/register' },
  ],
};

/** Open Graph + Twitter metadata for a page, always carrying the generated social image. */
export function og(title: string, description: string, path: string) {
  return {
    openGraph: { title, description, url: path, type: 'website' as const, siteName: `${SITE.product} by ${SITE.company}`, locale: SITE.locale, images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: `${SITE.product} · ${SITE.tagline}` }] },
    twitter: { card: 'summary_large_image' as const, title, description, images: ['/opengraph-image'] },
  };
}
