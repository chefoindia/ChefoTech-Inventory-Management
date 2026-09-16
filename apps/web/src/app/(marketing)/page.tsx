import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ScanBarcode, Boxes, CalendarClock, Truck, Wallet, Store, BarChart3, FileText, ShieldCheck, Sparkles, ClipboardList, Users, Lock, History, KeyRound, Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SITE, og } from '@/lib/site';
import { HOME_FAQ } from '@/content/faq';
import { Container, Section, Heading, FeatureGrid, Screenshot, SplitFeature, Steps, FaqList, CtaBand, CheckList } from '@/components/marketing/sections';
import { TrackedLink } from '@/components/marketing/tracked-link';
import { AssistantMock } from '@/components/marketing/assistant-mock';
import { LandingView } from '@/components/marketing/landing-view';
import { JsonLd, softwareJsonLd } from '@/components/marketing/json-ld';
import { BarcodeSection } from '@/components/marketing/barcode-section';

export const metadata: Metadata = {
  title: { absolute: 'PharmaOS · Pharmacy Management Software by ChefoTech' },
  description: 'Pharmacy management software for billing, batch and expiry inventory, purchases, customer credit (Baki), GST invoices, reports and multi-outlet control. Free 14-day trial.',
  alternates: { canonical: '/' },
  ...og('PharmaOS · Modern pharmacy management, simplified', SITE.description, '/'),
};

const CORE = [
  { icon: ScanBarcode, title: 'Billing & POS', body: 'Scan or search, pick the right batch automatically, split payments, print or share the GST invoice.', href: '/pharmacy-pos' },
  { icon: Boxes, title: 'Inventory with batches', body: 'Stock per batch with cost, MRP and expiry. Loose tablets stay exact in the smallest unit.', href: '/pharmacy-inventory-management' },
  { icon: CalendarClock, title: 'Expiry management', body: 'Near-expiry windows, expired stock blocked at the counter, supplier return and write-off flows.', href: '/pharmacy-inventory-management' },
  { icon: Truck, title: 'Purchases & GRN', body: 'Supplier invoice, goods receipt, batches and payables update together in one transaction.', href: '/pharmacy-management-software' },
  { icon: Wallet, title: 'Customer credit (Baki)', body: 'Credit limits, partial payments, overdue lists and statements that reconcile to the rupee.', href: '/pharmacy-billing-software' },
  { icon: Store, title: 'Multi-outlet', body: 'Separate stock and staff per branch, transfers between outlets, consolidated reports.', href: '/pharmacy-software-for-multiple-outlets' },
  { icon: BarChart3, title: 'Reports & analytics', body: 'Sales, margins, GST, fast and slow movers, dead stock, outlet and staff performance.', href: '/features#reports' },
  { icon: FileText, title: 'Documents & templates', body: 'Design invoices, receipts, GRNs and statements. Email PDFs or share a WhatsApp link.', href: '/features#documents' },
];

const AI_POINTS = [
  'Answers stock, sales and customer questions from your real data',
  'Reads supplier invoices and prescriptions into drafts you check',
  'Runs any report from a plain-language request and explains it',
  'Prepares sale, purchase and payment drafts; you confirm every one',
  'Explains any screen with "What is this?" in English, Hindi or Hinglish',
];

const TRUST = [
  { icon: Users, title: 'Role-based access', body: 'Owner, manager, pharmacist, cashier and custom roles. Permissions are enforced by the server, not just hidden in menus.' },
  { icon: Lock, title: 'Organization and outlet isolation', body: 'Every record belongs to your organization and every query is scoped to it. Staff can be limited to specific outlets.' },
  { icon: History, title: 'Audit log', body: 'Who changed what, when and from where, with before-and-after values for financial and security-relevant actions.' },
  { icon: ShieldCheck, title: 'Careful writes', body: 'Sales, purchases and payments are transactional and idempotent, so a retry never duplicates an invoice or deducts stock twice.' },
  { icon: KeyRound, title: 'Controlled AI actions', body: 'The assistant can only do what the signed-in user can do, and nothing that moves money or stock happens without a confirmation click.' },
  { icon: Download, title: 'Your data stays yours', body: 'Export your whole organization as JSON at any time. Documents are stored privately and shared only through signed links.' },
];

export default function HomePage() {
  return (
    <>
      <LandingView />
      <JsonLd data={softwareJsonLd()} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(20,184,166,0.10),transparent)]" aria-hidden />
        <Container className="pb-12 pt-14 text-center sm:pb-16 sm:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-medium text-fg-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden /> Pharmacy management software · A ChefoTech product
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl md:text-6xl">
            Modern pharmacy management, simplified.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-muted sm:text-lg">
            Manage sales, purchases, inventory, batches, expiry, customers, suppliers and reports from one platform, for a single counter or a chain of outlets. With an optional AI assistant that works from your real data.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <TrackedLink href="/register" eventProps={{ cta: 'hero_get_started' }} className={cn(buttonVariants({ size: 'lg' }), 'w-full px-6 sm:w-auto')}>
              Get started free <ArrowRight className="h-4 w-4" aria-hidden />
            </TrackedLink>
            <TrackedLink href="/demo" eventProps={{ cta: 'hero_demo' }} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full px-6 sm:w-auto')}>
              Book a demo
            </TrackedLink>
            <Link href="/features" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full sm:w-auto')}>
              Explore features
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-fg-subtle">14-day trial with every feature. No card required. GST-ready for India.</p>
          <div className="mx-auto mt-10 max-w-[1100px] sm:mt-14">
            <Screenshot src="/screenshots/dashboard.png" alt="PharmaOS dashboard for an outlet: revenue, purchases, low stock, expiring batches, dues and recent sales" priority />
          </div>
        </Container>
      </section>

      {/* Who / what / why */}
      <Section>
        <Container>
          <Heading eyebrow="Built for pharmacies" title="Everything a medical store runs on, in one place" lead="For independent pharmacies, retail chains, pharmacists, billing staff and inventory managers who are tired of a notebook for Baki, a spreadsheet for expiry and a billing app that knows nothing about batches." />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { title: 'Save time at the counter', body: 'Keyboard-first billing with barcode search, automatic batch selection and one-click invoices keeps the queue moving.' },
              { title: 'See your stock clearly', body: 'Batch-wise quantity, expiry status, reorder level and valuation, live, across every outlet.' },
              { title: 'Know your business', body: 'Sales, margins, dues, GST and slow stock in reports the owner can read on a phone.' },
            ].map((b) => (
              <div key={b.title} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <h3 className="text-[15px] font-semibold text-fg">{b.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{b.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* Core features */}
      <Section id="features" tone="muted">
        <Container>
          <Heading eyebrow="Core features" title="From the supplier bill to the customer's invoice" lead="Each module updates the others, so stock, ledgers and reports always agree." />
          <FeatureGrid items={CORE} />
          <div className="mt-8 text-center">
            <Link href="/features" className="inline-flex items-center gap-1 text-[14px] font-medium text-primary-700 hover:underline">
              See the full feature list <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Container>
      </Section>

      {/* Barcode scanning */}
      <BarcodeSection />

      {/* AI */}
      <Section id="ai">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <Heading align="left" eyebrow="AI-powered assistance" title="An assistant that knows your pharmacy" lead="Ask in plain English, Hindi or Hinglish. The assistant reads your stock, sales and ledgers through the same rules and permissions as the rest of the platform." />
              <CheckList items={AI_POINTS} className="mt-6" />
              <p className="mt-5 text-[13px] text-fg-subtle">
                Powered by Google Gemini. Optional: each organization connects its own Gemini API key in Settings. The assistant supports pharmacists and staff; it does not replace professional judgement.
              </p>
              <Link href="/ai-pharmacy-assistant" className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-primary-700 hover:underline">
                How the AI assistant works <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <AssistantMock />
          </div>
        </Container>
      </Section>

      {/* Deep dives */}
      <Section tone="muted" className="space-y-16 sm:space-y-24">
        <Container>
          <SplitFeature id="pos" eyebrow="POS & billing" title="Bill faster than a notebook, with a GST-correct invoice every time" body="Scan or search by name, salt or brand. The earliest-expiring batch is picked for you, loose tablets stay exact, and discounts respect each role's limit. Take cash, UPI, card and credit on one bill." bullets={['Held bills survive a refresh or a dropped connection', 'Schedule-H items ask for a prescription', 'Print, email or share the invoice on WhatsApp']} image="/screenshots/pos.png" imageAlt="PharmaOS point of sale with cart lines showing batch and expiry, and a payment split" cta={{ label: 'Pharmacy billing software', href: '/pharmacy-billing-software' }} />
        </Container>
        <Container>
          <SplitFeature id="inventory" flip eyebrow="Inventory, batches & expiry" title="Know what is on the shelf, which batch, and when it expires" body="Every purchase creates batches with cost, MRP and expiry. Stock is held per batch and per outlet. Near-expiry windows, reorder levels and dead-stock reports tell you what to act on this week." bullets={['Expired stock is blocked at the counter', 'Supplier return and write-off with reasons', 'Valuation at cost, movement history per batch']} image="/screenshots/inventory.png" imageAlt="PharmaOS inventory list with stock by product, batches, expiry status and reorder flags" cta={{ label: 'Pharmacy inventory management', href: '/pharmacy-inventory-management' }} />
        </Container>
        <Container>
          <SplitFeature id="purchases" eyebrow="Purchases & GRN" title="From the supplier's bill to the shelf, without re-typing" body="Enter the invoice with schemes and free quantities, receive in full or in parts, and let batches, stock and the supplier ledger update in one transaction. With the AI assistant, a photo of the bill becomes a draft you only check." bullets={['Partial receipts with short and damaged notes', 'Supplier due dates from payment terms', 'Purchase returns and debit notes']} image="/screenshots/purchase.png" imageAlt="PharmaOS purchase entry with product lines, batch, expiry, rate, MRP and GST per line" />
        </Container>
        <Container>
          <SplitFeature id="credit" flip eyebrow="Customers & Baki" title="Credit that reconciles, reminders that send themselves" body="Sell on credit within a limit, record partial payments against one or many invoices, and see who is overdue. Statements go out by email with the ledger attached." bullets={['Customer and supplier ledgers', 'Overdue and outstanding reports', 'Prescription records per customer']} image="/screenshots/customer-ledger.png" imageAlt="PharmaOS customer page with outstanding balance, ledger and payments" />
        </Container>
        <Container>
          <SplitFeature id="outlets" eyebrow="Multi-outlet" title="Every branch on its own, all of them together" body="Separate stock, sales, staff and numbering per outlet. Transfer stock between branches with dispatch and receipt. Compare outlets in consolidated reports without exporting anything." image="/screenshots/outlets.png" imageAlt="PharmaOS outlet settings listing branches" cta={{ label: 'Software for multiple outlets', href: '/pharmacy-software-for-multiple-outlets' }} />
        </Container>
        <Container>
          <SplitFeature id="reports" flip eyebrow="Reports & analytics" title="Reports that answer the owner's questions" body="Daily sales, margins, GST summary, fast and slow movers, dead stock, expiry, dues, outlet and staff performance. Filter by date and outlet, export to Excel, or ask the AI assistant to run one for you." image="/screenshots/reports.png" imageAlt="PharmaOS report with a chart and table" cta={{ label: 'All features', href: '/features' }} />
        </Container>
      </Section>

      {/* Trust */}
      <Section id="trust">
        <Container>
          <Heading eyebrow="Reliable business software" title="Built to be depended on every day" lead="Controls that a pharmacy, its accountant and its auditor can rely on." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-700"><t.icon className="h-4.5 w-4.5" aria-hidden /></span>
                <h3 className="mt-4 text-[15px] font-semibold text-fg">{t.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{t.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" tone="muted">
        <Container>
          <Heading eyebrow="How it works" title="Up and running in an afternoon" />
          <Steps items={[
            { title: 'Create your organization', body: 'Name, GST state and your owner login. A main outlet and standard roles are set up for you.' },
            { title: 'Add products and stock', body: 'Import products, customers and suppliers from Excel, then enter opening stock with batches and expiry.' },
            { title: 'Start billing', body: 'Invite staff with the right roles, plug in a barcode scanner if you have one, and bill from the POS.' },
            { title: 'Run the business', body: 'Purchases, credit, reports and, if you want, the AI assistant, all from the same login on any device.' },
          ]} />
        </Container>
      </Section>

      {/* Why ChefoTech */}
      <Section id="why-chefotech">
        <Container>
          <div className="grid gap-10 lg:grid-cols-2">
            <Heading align="left" eyebrow="Why ChefoTech" title="Software for people who run businesses" lead="ChefoTech builds practical business software. PharmaOS is its pharmacy product line, designed with pharmacy owners, pharmacists and billing staff so every screen does one job clearly." />
            <CheckList columns={1} items={['Money is stored to the paisa and every document keeps a snapshot of prices and names, so old invoices never change', 'Every feature on this site is in the product today; nothing here is a roadmap slide', 'One design system across the website, the app, invoices and emails', 'Direct support from the team that builds the product']} />
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section id="faq" tone="muted">
        <Container narrow>
          <Heading title="Questions pharmacies ask" />
          <FaqList className="mt-10" items={HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))} />
          <p className="mt-6 text-center text-[14px] text-fg-muted">
            More answers on the <Link href="/faq" className="font-medium text-primary-700 hover:underline">FAQ page</Link>.
          </p>
        </Container>
      </Section>

      <CtaBand source="home" />
    </>
  );
}
