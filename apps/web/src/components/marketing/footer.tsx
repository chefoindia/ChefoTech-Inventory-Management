import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { ChefoTechMark } from './brand';
import { SITE, FOOTER_LINKS } from '@/lib/site';

function Column({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">{title}</div>
      <ul className="mt-3 space-y-2 text-[13px] text-fg-muted">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:text-fg hover:underline underline-offset-2">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SOCIAL: { key: keyof typeof SITE.social; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'x', label: 'X' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'facebook', label: 'Facebook' },
];

/** Public website footer. Company contact and social links appear only when configured. */
export function MarketingFooter() {
  const social = SOCIAL.filter((s) => SITE.social[s.key]);
  const { contact } = SITE;
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-6">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-fg-subtle">
            Pharmacy management software for billing, inventory, batches and expiry, purchases, customer credit and reports, from one counter to a chain of outlets.
          </p>
          <div className="mt-4 flex items-center gap-2 text-[12px] text-fg-subtle">
            A product of {SITE.companyUrl ? <a href={SITE.companyUrl} className="hover:underline" rel="noopener"><ChefoTechMark size="sm" /></a> : <ChefoTechMark size="sm" />}
          </div>
          {contact.email || contact.phone || contact.address ? (
            <address className="mt-4 space-y-1 text-[13px] not-italic text-fg-muted">
              {contact.email ? <div><a href={`mailto:${contact.email}`} className="hover:text-fg hover:underline">{contact.email}</a></div> : null}
              {contact.phone ? <div><a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="hover:text-fg hover:underline">{contact.phone}</a></div> : null}
              {contact.address ? <div className="whitespace-pre-line">{contact.address}</div> : null}
            </address>
          ) : null}
          {social.length ? (
            <ul className="mt-4 flex flex-wrap gap-3 text-[13px]" aria-label="Social links">
              {social.map((s) => (
                <li key={s.key}>
                  <a href={SITE.social[s.key]} target="_blank" rel="noopener noreferrer" className="text-fg-muted hover:text-fg hover:underline">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Column title="Product" links={FOOTER_LINKS.product} />
        <Column title="Solutions" links={FOOTER_LINKS.solutions} />
        <Column title="Company" links={FOOTER_LINKS.company} />
        <Column title="Account" links={FOOTER_LINKS.account} />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 py-4 text-[12px] text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} {SITE.company}. {SITE.product} is a {SITE.company} product. All rights reserved.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-fg hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:text-fg hover:underline">Terms</Link>
            <Link href="/cookies" className="hover:text-fg hover:underline">Cookies</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
