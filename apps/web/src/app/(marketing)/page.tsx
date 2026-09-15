import Link from 'next/link';
import {
  Boxes,
  ScanBarcode,
  CalendarClock,
  Store,
  BarChart3,
  FileText,
  ShieldCheck,
  Wallet,
  ArrowRight,
  Check,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FEATURES = [
  { icon: Boxes, title: 'Batch-level inventory', body: 'Every product tracks batches with their own MRP, cost and expiry. Stock lives in base units so loose tablets never drift.' },
  { icon: ScanBarcode, title: 'Fast, keyboard-first POS', body: 'Scan or search, pick a batch automatically (first-expiry-first-out), split payments across cash, UPI, card and credit.' },
  { icon: CalendarClock, title: 'Expiry management', body: 'Configurable near-expiry windows, automatic exclusion of expired stock from sale, supplier return and write-off flows.' },
  { icon: Store, title: 'Multi-outlet by design', body: 'Separate stock, sales and staff per outlet with consolidated reporting and stock transfers between branches.' },
  { icon: Wallet, title: 'Credit (Baki) & payables', body: 'Customer and supplier ledgers, partial payments, credit limits, due dates and outstanding reports that reconcile.' },
  { icon: FileText, title: 'Your documents, your layout', body: 'Design invoices, GRNs, receipts and statements with a drag-and-drop template designer. Email PDFs directly from a sale.' },
  { icon: BarChart3, title: 'Reports that answer questions', body: 'Sales, purchases, margins, GST, fast and slow movers, dead stock, staff and outlet performance, all exportable.' },
  { icon: ShieldCheck, title: 'Enterprise-grade controls', body: 'Granular roles, server-enforced permissions, full audit trail and strict isolation between organizations.' },
];

const WORKFLOWS = [
  { title: 'Purchase → GRN → Stock → Payable', steps: ['Record the supplier invoice with schemes and free quantities', 'Receive goods in full or in parts, noting short or damaged items', 'Batches and stock update only on confirmed receipt', 'Supplier ledger and due dates update automatically'] },
  { title: 'Sale → Batch → Payment → Invoice', steps: ['Scan a barcode or search by name, salt or brand', 'The right batch is chosen for you; expired stock never sells', 'Apply item or bill discounts within your role limit', 'Collect cash, UPI, card or credit and print or email the invoice'] },
  { title: 'Credit → Partial payment → Cleared', steps: ['Sell on credit to a known customer within their limit', 'Record payments against one or many invoices', 'See outstanding, overdue and reminders in one place', 'Every rupee is traceable in the ledger'] },
];

const PLANS = [
  { name: 'Trial', price: 'Free for 14 days', tagline: 'Everything you need to evaluate PharmaOS.', bullets: ['Up to 3 outlets', 'Up to 10 users', 'All modules included'] },
  { name: 'Standard', price: 'Per outlet, per month', tagline: 'For single-store pharmacies and small chains.', bullets: ['Unlimited products', 'Email invoices', 'Reports and exports'] },
  { name: 'Business', price: 'Custom', tagline: 'For chains that need consolidation and control.', bullets: ['Unlimited outlets', 'Custom roles and audit', 'Priority support'] },
];

const FAQ = [
  { q: 'Does it handle loose sales like 3 tablets from a strip?', a: 'Yes. You define units and conversion factors per product (strip = 10 tablets). Stock is kept in the smallest unit so partial strips are exact.' },
  { q: 'What happens if the internet drops at the counter?', a: 'Drafts are preserved locally and every sale is submitted with an idempotency key, so a retry never creates a duplicate invoice or double-deducts stock.' },
  { q: 'Is Indian GST supported?', a: 'GST is built in: CGST/SGST vs IGST by place of supply, HSN codes, GSTIN on invoices and GST reports. The tax engine is modular so other regimes can be added.' },
  { q: 'Can I control who sees cost prices and profit?', a: 'Yes. Cost and profit are separate permissions. The server strips those fields for roles that do not have them.' },
  { q: 'Can I bring my existing data?', a: 'Products, customers, suppliers and opening stock can be imported from CSV/Excel with validation and a preview before anything is written.' },
];

export default function LandingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(20,184,166,0.12),transparent)]" aria-hidden />
        <div className="mx-auto w-full max-w-[1200px] px-6 pb-20 pt-20 text-center md:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-[12px] font-medium text-primary-800">
            Built for modern pharmacies
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-fg md:text-6xl">
            The operating platform for pharmacies.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-fg-muted">
            Inventory, batches, expiry, billing, purchases, credit and reports for one counter or a chain of outlets. Fast enough for the rush hour, careful enough for the auditor.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className={cn(buttonVariants({ size: 'lg' }), 'px-6')}>
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#workflows" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-6')}>
              See how it works
            </a>
          </div>
          <p className="mt-4 text-[13px] text-fg-subtle">14-day trial. No card required. Designed to scale with your business.</p>
        </div>
      </section>

      <section id="features" className="border-t border-border bg-surface-muted">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-fg">Everything a pharmacy runs on</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-fg-muted">One system for the counter, the store room, the back office and the owner.</p>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-700">
                  <f.icon className="h-4.5 w-4.5" />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-fg">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflows" className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-fg">Pharmacy workflows, end to end</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-fg-muted">Each step updates stock, ledgers and documents together, in one transaction.</p>
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {WORKFLOWS.map((w) => (
            <div key={w.title} className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
              <h3 className="text-[15px] font-semibold text-fg">{w.title}</h3>
              <ol className="mt-4 space-y-3">
                {w.steps.map((s, i) => (
                  <li key={s} className="flex gap-3 text-[13px] text-fg-muted">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-800">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section id="security" className="border-t border-border bg-slate-900 text-white">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-6 py-20 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Security and control, by default</h2>
            <p className="mt-3 text-slate-300">Your data is isolated from every other organization, every action is attributable, and permissions are enforced on the server, not just hidden in the interface.</p>
          </div>
          <ul className="grid gap-3 text-[14px] text-slate-200 sm:grid-cols-2">
            {['Strict tenant isolation', 'Granular roles & custom roles', 'Full audit trail with before/after', 'Encrypted passwords, rotating sessions', 'Private prescription documents', 'Idempotent, transactional writes', 'Rate limiting & secure headers', 'Managed database backups'].map((s) => (
              <li key={s} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary-400" /> {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="pricing" className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-fg">Simple plans</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-fg-muted">Start on a full-featured trial. Pricing is finalised before launch; plan limits are enforced by the platform.</p>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <div key={p.name} className={cn('rounded-[var(--radius-card)] border bg-surface p-6', i === 1 ? 'border-primary-400 shadow-[var(--shadow-popover)]' : 'border-border')}>
              <div className="text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">{p.name}</div>
              <div className="mt-2 text-xl font-semibold text-fg">{p.price}</div>
              <p className="mt-1 text-[13px] text-fg-muted">{p.tagline}</p>
              <ul className="mt-5 space-y-2 text-[13px] text-fg-muted">
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary-600" /> {b}
                  </li>
                ))}
              </ul>
              <Link href="/register" className={cn(buttonVariants({ variant: i === 1 ? 'primary' : 'secondary' }), 'mt-6 w-full')}>
                {i === 0 ? 'Start trial' : 'Contact us'}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="border-t border-border bg-surface-muted">
        <div className="mx-auto w-full max-w-[860px] px-6 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-fg">Questions pharmacies ask</h2>
          <dl className="mt-10 divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
            {FAQ.map((f) => (
              <div key={f.q} className="px-6 py-5">
                <dt className="text-[15px] font-medium text-fg">{f.q}</dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-fg">Run your pharmacy on a platform built for it</h2>
        <p className="mx-auto mt-3 max-w-xl text-fg-muted">Create your organization in under two minutes.</p>
        <Link href="/register" className={cn(buttonVariants({ size: 'lg' }), 'mt-8 px-6')}>
          Start free trial <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </>
  );
}
