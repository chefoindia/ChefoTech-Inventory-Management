/** Answers describe what PharmaOS actually does today. Keep them factual; they feed FAQ structured data. */
export interface FaqItem {
  q: string;
  a: string;
  topics: ('general' | 'inventory' | 'billing' | 'purchases' | 'customers' | 'outlets' | 'ai' | 'documents' | 'security')[];
}

export const FAQ: FaqItem[] = [
  {
    q: 'What is pharmacy management software?',
    a: 'Pharmacy management software runs the day-to-day work of a medical store in one place: billing at the counter, purchases from suppliers, stock with batches and expiry dates, customer and supplier accounts, GST invoices and reports. PharmaOS covers all of these for one shop or a chain of outlets, in a web browser, with no installation.',
    topics: ['general'],
  },
  {
    q: 'Can I manage multiple pharmacy outlets?',
    a: 'Yes. Each outlet keeps its own stock, sales, purchases and staff, while the owner sees consolidated reports across all branches. Stock can be transferred between outlets with a dispatch-and-receive flow, and users can be limited to specific outlets.',
    topics: ['outlets', 'general'],
  },
  {
    q: 'Can I track medicine batches?',
    a: 'Every purchase creates or updates a batch with its own batch number, expiry, MRP, cost and selling price. Stock is held per batch, and at the counter the earliest-expiring batch is picked first (FEFO) unless the cashier chooses another.',
    topics: ['inventory'],
  },
  {
    q: 'Can I track expiry dates?',
    a: 'Yes. You set near-expiry windows (for example 30, 60 and 90 days) and see expiring stock on the dashboard, in the inventory screen and in the expiry report. Expired batches are blocked from sale automatically and can be returned to the supplier or written off with a reason.',
    topics: ['inventory'],
  },
  {
    q: 'Can I sell loose tablets?',
    a: 'Yes. Each product defines its units and conversion (for example 1 strip = 10 tablets) and stock is kept in the smallest unit. You can bill 3 tablets from a strip and the stock stays exact. Loose sale can be switched off per product.',
    topics: ['billing', 'inventory'],
  },
  {
    q: 'Can I manage customer Baki (credit)?',
    a: 'Yes. Known customers can buy on credit within a limit you set. Every credit sale, partial payment and adjustment goes into the customer ledger, so outstanding, overdue amounts and statements are always reconciled. Reminders can be emailed with the statement attached.',
    topics: ['customers', 'billing'],
  },
  {
    q: 'Can I scan medicine barcodes?',
    a: 'Yes. The point of sale searches by barcode, product name, generic name or brand. Any USB or Bluetooth barcode scanner that types into a field works; there is nothing extra to install.',
    topics: ['billing'],
  },
  {
    q: 'Can I import purchase invoices?',
    a: 'You can enter supplier invoices line by line with schemes and free quantities, and with the optional AI assistant you can upload a photo or PDF of the invoice and have the lines, batches, expiry and prices read into a draft that you check before saving. Opening stock, products, customers and suppliers can also be imported from CSV or Excel.',
    topics: ['purchases', 'ai'],
  },
  {
    q: 'Does the system support GST?',
    a: 'Yes. GST is built in for India: CGST/SGST or IGST is decided by place of supply, HSN codes and GSTIN print on invoices, and there are GST summary reports for filing. The tax engine is modular so other regimes can be added.',
    topics: ['billing', 'general'],
  },
  {
    q: 'Can I generate PDF invoices?',
    a: 'Every sale, return, purchase, GRN, payment receipt and customer statement can be printed or downloaded as a PDF, emailed to the customer, or shared as a WhatsApp-ready link.',
    topics: ['documents'],
  },
  {
    q: 'Can I customize invoice designs?',
    a: 'Yes. The template designer lets you lay out invoices, receipts, GRNs and statements with your logo, columns, footer text and paper size (A4, A5 or thermal roll). Each document type can have its own template per outlet.',
    topics: ['documents'],
  },
  {
    q: 'Does the system have AI?',
    a: 'PharmaOS has an optional AI assistant powered by Google Gemini. Each organization connects its own Gemini API key in Settings; until then the platform works exactly as normal. The assistant answers questions about your stock, sales and customers, reads supplier invoices and prescriptions, runs reports in plain language and prepares drafts. It can only do what the signed-in user is allowed to do, and money or stock never move without a confirmation click.',
    topics: ['ai'],
  },
  {
    q: 'Can pharmacy staff use the system easily?',
    a: 'The point of sale is keyboard-first (search, pick, quantity, payment, done) and works on a laptop, desktop or tablet. Each staff member gets a role such as cashier, pharmacist or manager that shows only what they need. Every screen has a "What is this?" explainer when the AI assistant is enabled.',
    topics: ['general', 'billing'],
  },
  {
    q: 'Can I manage supplier payments?',
    a: 'Yes. Each purchase updates the supplier ledger with the due date from their payment terms. You record full or partial payments against one or many invoices, see payables and overdue amounts, and print supplier statements.',
    topics: ['purchases', 'customers'],
  },
  {
    q: 'Can I transfer stock between outlets?',
    a: 'Yes. Create a transfer from one outlet to another, dispatch it, and receive it at the destination. Stock moves batch by batch and both outlets keep a full movement history.',
    topics: ['outlets', 'inventory'],
  },
  {
    q: 'Is my data separate from other pharmacies?',
    a: 'Yes. Every record belongs to your organization and every query is scoped to it on the server. Roles and permissions are enforced by the API, not just hidden in the interface, and an audit log records who changed what. You can export your whole organization as JSON at any time.',
    topics: ['security'],
  },
  {
    q: 'What happens if the internet drops at the counter?',
    a: 'The bill being typed is kept on the device and restored after a refresh or reconnection. Completing a sale needs a connection, and every submission carries an idempotency key so a retry never creates a duplicate invoice or deducts stock twice.',
    topics: ['billing', 'security'],
  },
  {
    q: 'How do I get started?',
    a: 'Create your organization from the Get started button: it sets up your pharmacy, a main outlet and your owner account on a 14-day trial with every feature, no card needed. Add products (or import them), enter opening stock and start billing. You can also book a demo and we will walk you through it.',
    topics: ['general'],
  },
];

export const HOME_FAQ = FAQ.filter((f) => ['Can I sell loose tablets?', 'Can I manage customer Baki (credit)?', 'Does the system support GST?', 'Does the system have AI?', 'Can I manage multiple pharmacy outlets?', 'What happens if the internet drops at the counter?'].includes(f.q));
