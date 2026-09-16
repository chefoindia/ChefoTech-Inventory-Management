import type { Metadata } from 'next';
import { og } from '@/lib/site';
import Link from 'next/link';
import { ScanBarcode, Boxes, Store, Truck, Wallet, BarChart3, ShieldCheck, FileText, Sparkles, Settings2 } from 'lucide-react';
import { Container, Section, Heading, CheckList, Screenshot, CtaBand, Breadcrumbs } from '@/components/marketing/sections';
import { LandingView } from '@/components/marketing/landing-view';
import { JsonLd, breadcrumbJsonLd } from '@/components/marketing/json-ld';

export const metadata: Metadata = {
  title: 'Features · Pharmacy Billing, Inventory, Purchases, Reports',
  description: 'Every PharmaOS module: GST billing and POS, batch and expiry inventory, purchases and GRN, customer credit, multi-outlet, documents, roles, reports and the AI assistant.',
  alternates: { canonical: '/features' },
  ...og('PharmaOS features', 'Every module of the pharmacy platform, explained.', '/features'),
};

const GROUPS: { id: string; icon: typeof ScanBarcode; title: string; intro: string; items: string[]; image?: { src: string; alt: string } }[] = [
  { id: 'pos', icon: ScanBarcode, title: 'POS & billing', intro: 'A keyboard-first counter that understands medicines.', items: ['Search by barcode, name, generic name, brand or manufacturer', 'Automatic first-expiry-first-out batch choice with manual override', 'Loose units (tablets) and packs (strips) from the same stock', 'Item and bill discounts within each role\'s limit', 'Cash, UPI, card and credit on one bill; change calculation', 'Held bills per outlet; the bill in progress survives a refresh', 'Walk-in or saved customer, prescription attached for schedule items', 'Returns against an invoice with restock or write-off, refund or credit note'], image: { src: '/screenshots/pos.png', alt: 'PharmaOS point of sale' } },
  { id: 'inventory', icon: Boxes, title: 'Inventory, batches & expiry', intro: 'Stock per batch, per outlet, with every movement recorded.', items: ['Batch number, expiry, MRP, cost and selling price per batch', 'Opening stock entry and Excel import', 'Near-expiry windows you configure; expired stock blocked at the counter', 'Low-stock and reorder-level lists per outlet', 'Stock adjustments with reasons and audit trail', 'Stock transfers between outlets with dispatch and receipt', 'Valuation at cost, fast and slow movers, dead stock', 'Product categories, units and conversion factors, custom fields'], image: { src: '/screenshots/batches.png', alt: 'PharmaOS product batches with expiry' } },
  { id: 'purchases', icon: Truck, title: 'Purchases & GRN', intro: 'From supplier bill to shelf to payable in one flow.', items: ['Supplier invoice with schemes, free quantity and per-line GST', 'Receive now or through a separate goods receipt (GRN)', 'Partial receipts with short and damaged quantities', 'Batches, stock and supplier ledger update in one transaction', 'Purchase returns and debit notes', 'Supplier payment terms and due dates', 'Invoice scans attached to the purchase', 'AI invoice reading into a draft you check (optional)'], image: { src: '/screenshots/purchase.png', alt: 'PharmaOS purchase entry form' } },
  { id: 'customers', icon: Wallet, title: 'Customers, credit & suppliers', intro: 'Ledgers that reconcile, reminders that go out.', items: ['Customer credit (Baki) with limits and due dates', 'Partial payments against one or many invoices', 'Customer and supplier ledgers and statements', 'Outstanding and overdue reports', 'Statement email as a payment reminder', 'Prescription records per customer with scans', 'Customer purchase history at the counter'], image: { src: '/screenshots/customer-ledger.png', alt: 'PharmaOS customer ledger' } },
  { id: 'outlets', icon: Store, title: 'Multi-outlet', intro: 'Branches that run alone and report together.', items: ['Separate stock, sales, purchases and numbering per outlet', 'Outlet-level staff access and an outlet switcher', 'Stock transfers between outlets', 'Consolidated and per-outlet reports', 'Business hours, GST state and address per outlet'], image: { src: '/screenshots/outlets.png', alt: 'PharmaOS outlets' } },
  { id: 'reports', icon: BarChart3, title: 'Reports & dashboard', intro: 'The numbers an owner asks for, without a spreadsheet.', items: ['Dashboard with revenue, purchases, dues, low stock and expiring batches', 'Daily sales and day book', 'Margins and profit (permission-controlled)', 'GST summary for filing', 'Fast and slow movers, dead stock, expiry', 'Outlet and staff performance', 'Excel export on every report'], image: { src: '/screenshots/reports.png', alt: 'PharmaOS report' } },
  { id: 'documents', icon: FileText, title: 'Documents & template designer', intro: 'Your invoices, your layout.', items: ['Invoices, receipts, GRNs, returns, statements as PDF', 'Drag-and-drop template designer with logo, columns and footer', 'A4, A5 and thermal roll sizes', 'Email PDFs directly from a document', 'WhatsApp-ready signed share links', 'Per-outlet templates'], image: { src: '/screenshots/template-designer.png', alt: 'PharmaOS template designer' } },
  { id: 'ai', icon: Sparkles, title: 'AI assistant (optional)', intro: 'Powered by Google Gemini with your organization\'s own key.', items: ['Assistant on every page, in English, Hindi or Hinglish', 'Answers from your real stock, sales and ledgers', 'Reads supplier invoices and prescriptions into drafts', 'Runs reports from plain-language requests', 'Prepares sale, purchase and payment drafts you confirm', '"What is this?" help on every screen', 'Same permissions as the signed-in user; actions are audited'] },
  { id: 'access', icon: ShieldCheck, title: 'Roles, security & audit', intro: 'Controls enforced on the server.', items: ['Owner, manager, pharmacist, cashier and custom roles', 'Cost and profit as separate permissions', 'Full audit log with before-and-after values', 'Organization and outlet isolation', 'Login activity and session management', 'Whole-organization JSON export'] },
  { id: 'more', icon: Settings2, title: 'Also included', intro: 'The details that make daily work smooth.', items: ['Excel/CSV import for products, customers, suppliers and opening stock', 'In-app, email, SMS, WhatsApp and push notifications for low stock, expiry and dues', 'Custom fields on products, customers, suppliers, sales and purchases', 'Works on desktop, laptop, tablet and phone', 'Connection banner and offline-safe drafts at the counter'] },
];

export default function FeaturesPage() {
  return (
    <>
      <LandingView event="feature_page_interaction" />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Features', path: '/features' }])} />
      <section className="border-b border-border">
        <Container className="pb-10 pt-10 sm:pt-16">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Features' }]} />
          <Heading align="left" as="h1" className="mt-6" eyebrow="Features" title="Everything in PharmaOS, module by module" lead="Every item below is in the product today. Pick a module to jump to it." />
          <nav aria-label="Feature sections" className="mt-6 flex flex-wrap gap-2">
            {GROUPS.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-fg-muted hover:border-primary-300 hover:text-fg">
                {g.title}
              </a>
            ))}
          </nav>
        </Container>
      </section>

      {GROUPS.map((g, i) => (
        <Section key={g.id} id={g.id} tone={i % 2 === 1 ? 'muted' : 'default'} className="scroll-mt-20">
          <Container>
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
              <div>
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-700"><g.icon className="h-4.5 w-4.5" aria-hidden /></span>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-fg">{g.title}</h2>
                <p className="mt-2 text-[15px] text-fg-muted">{g.intro}</p>
                <CheckList items={g.items} className="mt-5" />
              </div>
              {g.image ? <Screenshot src={g.image.src} alt={g.image.alt} sizes="(min-width: 1024px) 560px, 100vw" /> : null}
            </div>
          </Container>
        </Section>
      ))}

      <Section>
        <Container className="text-center">
          <p className="text-[15px] text-fg-muted">
            Looking for a specific use case? See <Link href="/pharmacy-billing-software" className="font-medium text-primary-700 hover:underline">billing</Link>, <Link href="/pharmacy-inventory-management" className="font-medium text-primary-700 hover:underline">inventory</Link> or <Link href="/pharmacy-software-for-multiple-outlets" className="font-medium text-primary-700 hover:underline">multi-outlet</Link> pages, or <Link href="/pricing" className="font-medium text-primary-700 hover:underline">compare plans</Link>.
          </p>
        </Container>
      </Section>
      <CtaBand source="features" />
    </>
  );
}
