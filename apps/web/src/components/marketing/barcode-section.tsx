import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container, Section, Heading } from './sections';
import { ScanAtCounter, PackWithBarcode, PrintLabels } from './illustrations';

/**
 * How barcode scanning works in PharmaOS, with our own illustrations. Every sentence here describes
 * shipped behaviour: keyboard-wedge scanners at the POS, barcode lookup with a search fallback,
 * several barcodes per product tied to a unit, and label printing from the product page. Batch and
 * expiry are NOT read from the barcode (retail EAN/UPC codes do not carry them), so the copy says so.
 */
const STEPS = [
  {
    Art: ScanAtCounter,
    title: 'Scan at the counter',
    body: 'Plug in any USB or Bluetooth barcode scanner; it types into the POS like a keyboard. The code is looked up instantly and the line lands on the bill with the earliest-expiring batch. No match? The same box searches by name, salt or brand.',
  },
  {
    Art: PackWithBarcode,
    title: 'One product, several barcodes',
    body: 'A product can hold more than one barcode, each tied to a unit, so the strip and the box of the same medicine scan as 10 tablets or 1 box. Batch number, expiry and MRP come from the pack when you enter the purchase, not from the barcode.',
  },
  {
    Art: PrintLabels,
    title: 'Print labels for the rest',
    body: 'Loose items, repacks and products without a manufacturer code get a label printed from the product page, so everything on the shelf scans the same way.',
  },
];

export function BarcodeSection({ id = 'barcode', tone = 'default' as const, cta = true }: { id?: string; tone?: 'default' | 'muted'; cta?: boolean }) {
  return (
    <Section id={id} tone={tone}>
      <Container>
        <Heading eyebrow="Barcode scanning" title="Scan the pack, and the bill is done" lead="PharmaOS works with the barcode scanner you already have. Here is what happens from the scanner to the invoice." />
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
              <div className="border-b border-border bg-surface-muted p-4">
                <s.Art />
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[12px] font-semibold text-white" aria-hidden>{i + 1}</span>
                  <h3 className="text-[15px] font-semibold text-fg">{s.title}</h3>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        {cta ? (
          <div className="mt-8 text-center">
            <Link href="/pharmacy-pos" className="inline-flex items-center gap-1 text-[14px] font-medium text-primary-700 hover:underline">
              More about the POS <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        ) : null}
      </Container>
    </Section>
  );
}
