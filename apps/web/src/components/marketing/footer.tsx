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

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;
const wa = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`;

/** Public website footer with the ChefoTech company details. */
export function MarketingFooter() {
  const social = SOCIAL.filter((s) => SITE.social[s.key]);
  const { contact } = SITE;
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Logo />
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-fg-subtle">
            Pharmacy management software for billing, inventory, batches and expiry, purchases, customer credit and reports, from one counter to a chain of outlets.
          </p>
          <div className="mt-5 flex items-center gap-2 text-[12px] text-fg-subtle">
            <span>A product of</span>
            {SITE.companyUrl ? <a href={SITE.companyUrl} rel="noopener" className="hover:underline"><ChefoTechMark size="sm" /></a> : <ChefoTechMark size="sm" />}
          </div>
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

        <div className="lg:col-span-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Contact {SITE.company}</div>
          <address className="mt-3 space-y-1.5 text-[13px] not-italic text-fg-muted">
            {contact.person ? <div className="text-fg">{contact.person}</div> : null}
            {contact.phone ? <div><a href={tel(contact.phone)} className="hover:text-fg hover:underline">{contact.phone}</a></div> : null}
            {contact.altPhone ? <div><a href={tel(contact.altPhone)} className="hover:text-fg hover:underline">{contact.altPhone}</a></div> : null}
            {contact.whatsapp ? <div><a href={wa(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="hover:text-fg hover:underline">WhatsApp {contact.whatsapp}</a></div> : null}
            {contact.email ? <div><a href={`mailto:${contact.email}`} className="hover:text-fg hover:underline">{contact.email}</a></div> : null}
            {contact.salesEmail && contact.salesEmail !== contact.email ? <div><a href={`mailto:${contact.salesEmail}`} className="hover:text-fg hover:underline">{contact.salesEmail}</a></div> : null}
          </address>
          {contact.offices.length ? (
            <div className="mt-4 space-y-3 text-[13px] text-fg-muted">
              {contact.offices.map((o) => (
                <address key={o.label} className="not-italic">
                  <div className="text-[12px] font-medium text-fg-subtle">{o.label}</div>
                  {o.lines.map((l) => <div key={l}>{l}</div>)}
                </address>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-5">
          <Column title="Product" links={FOOTER_LINKS.product} />
          <Column title="Solutions" links={FOOTER_LINKS.solutions} />
          <div className="space-y-8">
            <Column title="Company" links={FOOTER_LINKS.company} />
            <Column title="Account" links={FOOTER_LINKS.account} />
          </div>
        </div>
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
