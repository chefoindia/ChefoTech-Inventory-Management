import type { LucideIcon } from 'lucide-react';
import { ScanBarcode, Receipt, Boxes, CalendarClock, Store, Truck, Wallet, BarChart3, Users, ArrowLeftRight, ShieldCheck, FileText, Sparkles, Tablets, Percent, Smartphone } from 'lucide-react';

export interface SolutionSection {
  eyebrow?: string;
  title: string;
  body: string;
  bullets?: string[];
  image: string;
  imageAlt: string;
}

export interface Solution {
  slug: string;
  /** H1 on the page. */
  title: string;
  /** <title>; keep under ~60 characters. */
  metaTitle: string;
  /** Meta description; 140–160 characters. */
  description: string;
  eyebrow: string;
  lead: string;
  hero: { image: string; imageAlt: string };
  highlights: { icon: LucideIcon; title: string; body: string }[];
  sections: SolutionSection[];
  /** Questions from the shared FAQ to show on this page (exact `q` strings). */
  faq: string[];
  related: { label: string; href: string }[];
}

export const SOLUTIONS: Solution[] = [
  {
    slug: 'pharmacy-management-software',
    title: 'Pharmacy management software for the whole store',
    metaTitle: 'Pharmacy Management Software | PharmaOS by ChefoTech',
    description: 'Pharmacy management software that runs billing, purchases, batch and expiry stock, customer credit, GST invoices and reports for one shop or many outlets. Free 14-day trial.',
    eyebrow: 'Pharmacy management software',
    lead: 'One platform for the counter, the store room and the owner: sales, purchases, stock with batches and expiry, customer and supplier accounts, documents and reports, with the same numbers everywhere.',
    hero: { image: '/screenshots/dashboard.png', imageAlt: 'PharmaOS dashboard showing revenue, low stock, expiring batches and recent sales for an outlet' },
    highlights: [
      { icon: ScanBarcode, title: 'Bill in seconds', body: 'Scan or search, the right batch is picked, split payments across cash, UPI, card and credit.' },
      { icon: Boxes, title: 'Stock you can trust', body: 'Every movement is recorded per batch, so quantity on hand, valuation and expiry are always current.' },
      { icon: Truck, title: 'Purchases to payables', body: 'Supplier invoice, goods receipt, batches and the supplier ledger update together.' },
      { icon: BarChart3, title: 'Reports that answer questions', body: 'Sales, margins, GST, fast and slow movers, dead stock, outlet and staff performance.' },
    ],
    sections: [
      { eyebrow: 'Sales', title: 'A point of sale built for a pharmacy counter', body: 'Search by name, salt, brand or barcode. Loose tablets from a strip, schedule-H checks, item and bill discounts within each role\'s limit, and an invoice that prints, emails or shares in one click.', bullets: ['First-expiry-first-out batch selection', 'Held bills and quick customer lookup', 'Prescription link for schedule H/H1/X items'], image: '/screenshots/pos.png', imageAlt: 'PharmaOS point of sale with a product search, cart lines with batch and expiry, and payment split' },
      { eyebrow: 'Inventory', title: 'Batches, expiry and reorder in one view', body: 'See stock per product and per batch, what is expiring in 30, 60 or 90 days, what is below reorder level and what has not moved. Adjust with a reason and a full audit trail.', bullets: ['Opening stock import from Excel', 'Near-expiry alerts and expired-stock blocking', 'Stock valuation at cost'], image: '/screenshots/inventory.png', imageAlt: 'PharmaOS inventory screen with stock by product, batches, expiry status and reorder flags' },
      { eyebrow: 'Purchases', title: 'From supplier bill to shelf without re-typing', body: 'Enter the supplier invoice with schemes and free quantities, receive in full or in parts, and let batches, stock and the supplier ledger update in one transaction. With the AI assistant, a photo of the bill becomes a draft you only check.', image: '/screenshots/purchase.png', imageAlt: 'PharmaOS purchase entry form with product lines, batch, expiry, rate, MRP and GST per line' },
      { eyebrow: 'Customers & credit', title: 'Baki that reconciles to the rupee', body: 'Credit limits, partial payments against many invoices, overdue lists and statements you can email as reminders. Every entry is in the ledger; nothing lives in a notebook.', image: '/screenshots/customer-ledger.png', imageAlt: 'PharmaOS customer page with outstanding balance, ledger entries and payment history' },
    ],
    faq: ['What is pharmacy management software?', 'Can I sell loose tablets?', 'Does the system support GST?', 'Can I manage multiple pharmacy outlets?', 'How do I get started?'],
    related: [{ label: 'Pharmacy billing software', href: '/pharmacy-billing-software' }, { label: 'Pharmacy inventory management', href: '/pharmacy-inventory-management' }, { label: 'Software for multiple outlets', href: '/pharmacy-software-for-multiple-outlets' }],
  },
  {
    slug: 'pharmacy-billing-software',
    title: 'Pharmacy billing software with GST invoices and credit',
    metaTitle: 'Pharmacy Billing Software with GST | PharmaOS by ChefoTech',
    description: 'Pharmacy billing software for fast counter sales: barcode scanning, loose tablets, GST invoices, split payments, customer credit (Baki), returns and PDF or WhatsApp invoices.',
    eyebrow: 'Pharmacy billing software',
    lead: 'Bill faster than a notebook and get a GST-correct invoice every time. Split payments, sell on credit to known customers, handle returns, and print, email or share the invoice from the same screen.',
    hero: { image: '/screenshots/pos.png', imageAlt: 'PharmaOS point of sale showing cart lines, batch selection and payment options' },
    highlights: [
      { icon: ScanBarcode, title: 'Barcode and search', body: 'Any USB or Bluetooth scanner works. Search also matches salt, brand and manufacturer.' },
      { icon: Tablets, title: 'Loose and pack sales', body: 'Sell 3 tablets or 3 strips; stock stays exact in the smallest unit.' },
      { icon: Percent, title: 'GST done right', body: 'CGST/SGST or IGST by place of supply, HSN on lines, tax-inclusive or exclusive pricing.' },
      { icon: Wallet, title: 'Cash, UPI, card, credit', body: 'Mix payment methods on one bill and record credit against the customer\'s limit.' },
    ],
    sections: [
      { eyebrow: 'Speed', title: 'Keyboard-first, so the queue keeps moving', body: 'Type to search, Enter to add, arrow keys to change quantity, one shortcut to pay. The cashier never needs the mouse. Bills in progress are held and restored, even after a refresh or a dropped connection.', bullets: ['Hold and resume bills', 'Automatic FEFO batch, manual override allowed', 'Discount limits enforced per role'], image: '/screenshots/pos.png', imageAlt: 'PharmaOS point of sale with keyboard shortcuts visible' },
      { eyebrow: 'Documents', title: 'Invoices the way you want them printed', body: 'A4, A5 or thermal roll. Your logo, your columns, your footer. Print, download the PDF, email it to the customer or share a WhatsApp link, all from the sale.', image: '/screenshots/template-designer.png', imageAlt: 'PharmaOS template designer editing an invoice layout' },
      { eyebrow: 'Credit', title: 'Sell on Baki without losing track', body: 'A credit sale posts to the customer ledger immediately. Take partial payments later against one or many invoices, see who is overdue, and send a statement as a reminder.', image: '/screenshots/customer-ledger.png', imageAlt: 'PharmaOS customer ledger with credit sales and payments' },
    ],
    faq: ['Can I scan medicine barcodes?', 'Can I sell loose tablets?', 'Does the system support GST?', 'Can I manage customer Baki (credit)?', 'Can I generate PDF invoices?', 'What happens if the internet drops at the counter?'],
    related: [{ label: 'Pharmacy POS', href: '/pharmacy-pos' }, { label: 'Pharmacy management software', href: '/pharmacy-management-software' }, { label: 'Pricing', href: '/pricing' }],
  },
  {
    slug: 'pharmacy-pos',
    title: 'Pharmacy POS software for a busy counter',
    metaTitle: 'Pharmacy POS Software | PharmaOS by ChefoTech',
    description: 'Pharmacy POS software that runs in any browser on a laptop, desktop or tablet: barcode scanning, batch and expiry aware billing, held bills, split payments, instant invoices.',
    eyebrow: 'Pharmacy POS',
    lead: 'A point of sale that understands medicines: batches, expiry, schedule-H, loose units and credit customers, on the hardware you already have.',
    hero: { image: '/screenshots/pos.png', imageAlt: 'PharmaOS POS screen' },
    highlights: [
      { icon: Smartphone, title: 'Runs in a browser', body: 'Laptop, desktop or tablet. Nothing to install and updates arrive automatically.' },
      { icon: CalendarClock, title: 'Expiry-aware', body: 'Expired batches never appear in the cart; near-expiry batches are flagged.' },
      { icon: Users, title: 'Roles for staff', body: 'Cashiers bill, pharmacists approve schedule items, managers see cost and margin.' },
      { icon: Receipt, title: 'Returns and exchanges', body: 'Return against an invoice, restock or write off, refund or credit note.' },
    ],
    sections: [
      { eyebrow: 'Counter flow', title: 'Search, add, pay, print', body: 'The whole bill happens in one screen. Customer lookup by phone, walk-in by default, prescription attached when a schedule item is added, payment split at the end.', bullets: ['Held bills per outlet', 'Shortcut keys for every step', 'Works with any keyboard-emulating scanner'], image: '/screenshots/pos.png', imageAlt: 'PharmaOS POS cart' },
      { eyebrow: 'Behind the counter', title: 'Every sale updates stock, ledger and reports at once', body: 'Stock is deducted per batch, credit posts to the customer, GST goes to the tax summary and the sale appears in the day book, in a single transaction. If anything fails, nothing half-saves.', image: '/screenshots/reports.png', imageAlt: 'PharmaOS sales report' },
      { eyebrow: 'Mobile', title: 'Check stock or a customer balance from your phone', body: 'The dashboard, inventory, customers and reports adapt to a phone screen, so the owner can check the day from anywhere.', image: '/screenshots/mobile-dashboard.png', imageAlt: 'PharmaOS dashboard on a phone screen' },
    ],
    faq: ['Can I scan medicine barcodes?', 'Can pharmacy staff use the system easily?', 'What happens if the internet drops at the counter?', 'Can I generate PDF invoices?'],
    related: [{ label: 'Pharmacy billing software', href: '/pharmacy-billing-software' }, { label: 'Pharmacy inventory management', href: '/pharmacy-inventory-management' }, { label: 'Features', href: '/features' }],
  },
  {
    slug: 'pharmacy-inventory-management',
    title: 'Pharmacy inventory management with batches and expiry',
    metaTitle: 'Pharmacy Inventory Management Software | PharmaOS',
    description: 'Medicine inventory software with batch-wise stock, expiry tracking, near-expiry alerts, reorder levels, adjustments, transfers and valuation reports for one or many outlets.',
    eyebrow: 'Pharmacy inventory management',
    lead: 'Know exactly what is on the shelf, which batch it is, when it expires and what it is worth, without a physical count every week.',
    hero: { image: '/screenshots/inventory.png', imageAlt: 'PharmaOS inventory screen' },
    highlights: [
      { icon: Boxes, title: 'Batch-wise stock', body: 'Quantity, cost, MRP and expiry per batch; movements recorded for every change.' },
      { icon: CalendarClock, title: 'Expiry control', body: 'Near-expiry windows, blocked sale of expired stock, supplier return and write-off flows.' },
      { icon: ArrowLeftRight, title: 'Adjustments and transfers', body: 'Count corrections with reasons; transfers between outlets with dispatch and receipt.' },
      { icon: BarChart3, title: 'Valuation and movement', body: 'Stock value at cost, fast and slow movers, dead stock and reorder suggestions.' },
    ],
    sections: [
      { eyebrow: 'Expiry', title: 'Nothing expires quietly on the shelf', body: 'Set the windows that matter to you. The dashboard, inventory list and expiry report show what is due, so you can return it to the supplier while it still has value or discount it before it is lost.', bullets: ['Expiry report by outlet and supplier', 'Expired stock blocked at the counter', 'Write-off with reason and audit trail'], image: '/screenshots/batches.png', imageAlt: 'PharmaOS product batches with expiry dates and status' },
      { eyebrow: 'Reorder', title: 'Reorder before you run out', body: 'Reorder levels per product, a low-stock list per outlet and, with the AI assistant, a plain-language reorder list based on recent sales.', image: '/screenshots/inventory.png', imageAlt: 'PharmaOS low stock list' },
      { eyebrow: 'Accuracy', title: 'Every movement has a reason and a person', body: 'Purchases, sales, returns, adjustments and transfers all write to the same movement ledger. Cost and profit are separate permissions, so staff see stock without seeing margins.', image: '/screenshots/reports.png', imageAlt: 'PharmaOS stock movement report' },
    ],
    faq: ['Can I track medicine batches?', 'Can I track expiry dates?', 'Can I transfer stock between outlets?', 'Can I sell loose tablets?', 'Can I import purchase invoices?'],
    related: [{ label: 'Pharmacy management software', href: '/pharmacy-management-software' }, { label: 'Software for multiple outlets', href: '/pharmacy-software-for-multiple-outlets' }, { label: 'AI assistant', href: '/ai-pharmacy-assistant' }],
  },
  {
    slug: 'pharmacy-software-for-multiple-outlets',
    title: 'Pharmacy software for multiple outlets and chains',
    metaTitle: 'Pharmacy Software for Multiple Outlets | PharmaOS',
    description: 'Run a pharmacy chain from one login: separate stock, sales and staff per outlet, stock transfers between branches, outlet-level roles and consolidated reports for the owner.',
    eyebrow: 'Multi-outlet pharmacies',
    lead: 'Each branch runs its own counter and store room. You see all of them, compare them and move stock between them, without merging spreadsheets.',
    hero: { image: '/screenshots/outlets.png', imageAlt: 'PharmaOS outlet settings listing branches with GST state, business hours and staff' },
    highlights: [
      { icon: Store, title: 'Outlet isolation', body: 'Stock, sales, purchases, documents and numbering are separate per outlet.' },
      { icon: ArrowLeftRight, title: 'Stock transfers', body: 'Dispatch from one branch, receive at another, batch by batch.' },
      { icon: ShieldCheck, title: 'Outlet-level access', body: 'Assign staff to specific outlets; managers switch between the ones they run.' },
      { icon: BarChart3, title: 'Consolidated reports', body: 'Sales, margins, stock and dues by outlet, side by side or combined.' },
    ],
    sections: [
      { eyebrow: 'Control', title: 'One organization, many outlets', body: 'Add outlets with their own address, GST state, invoice numbering and business hours. Templates, roles and custom fields can be shared or set per outlet.', bullets: ['Per-outlet document numbering', 'Outlet switcher for multi-site staff', 'Plan limits enforced per organization'], image: '/screenshots/outlets.png', imageAlt: 'PharmaOS outlets list' },
      { eyebrow: 'Movement', title: 'Move stock where it sells', body: 'A transfer takes stock out of the sending outlet on dispatch and adds it at the receiving outlet on receipt, keeping batch and expiry intact. Both sides keep a full movement history.', image: '/screenshots/inventory.png', imageAlt: 'PharmaOS stock transfer' },
      { eyebrow: 'Visibility', title: 'Compare outlets without exporting anything', body: 'Outlet performance, staff performance, dues and expiry are available per outlet and consolidated. Cost and profit stay behind their own permissions.', image: '/screenshots/reports.png', imageAlt: 'PharmaOS outlet performance report' },
    ],
    faq: ['Can I manage multiple pharmacy outlets?', 'Can I transfer stock between outlets?', 'Is my data separate from other pharmacies?', 'Can pharmacy staff use the system easily?'],
    related: [{ label: 'Pharmacy inventory management', href: '/pharmacy-inventory-management' }, { label: 'Pricing', href: '/pricing' }, { label: 'Book a demo', href: '/demo' }],
  },
];

export const solutionBySlug = (slug: string) => SOLUTIONS.find((s) => s.slug === slug);

/** Icons reused by the features page. */
export const FEATURE_ICONS = { ScanBarcode, Receipt, Boxes, CalendarClock, Store, Truck, Wallet, BarChart3, Users, ArrowLeftRight, ShieldCheck, FileText, Sparkles };
