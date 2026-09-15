import type { ProductSearchHit, ProductUnitDto, SaleLineInput, HoldSaleInput } from '@pharmaos/shared';

/** Minimal product info the cart needs; batches/prices come from the server quote. */
export interface CartProduct {
  id: string;
  name: string;
  packLabel: string;
  requiresPrescription: boolean;
  schedule: string;
  units: ProductUnitDto[];
  baseUnitId: string;
  pricingUnitId: string;
  mrpMinor: number;
  sellingPriceMinor: number;
  stockBase?: number;
  batches?: ProductSearchHit['batches'];
}

export interface CartLine {
  key: string;
  product: CartProduct;
  batchId?: string;
  unitId: string;
  qty: number;
  unitPriceMinor?: number;
  discountBps: number;
  discountMinor: number;
  note: string;
}

export function toCartProduct(p: ProductSearchHit): CartProduct {
  return { id: p.id, name: p.name, packLabel: p.packLabel, requiresPrescription: p.requiresPrescription, schedule: p.schedule, units: p.units, baseUnitId: p.baseUnitId, pricingUnitId: p.pricingUnitId, mrpMinor: p.pricing.mrpMinor, sellingPriceMinor: p.pricing.sellingPriceMinor, stockBase: p.stockBase, batches: p.batches };
}

export function defaultSaleUnit(p: CartProduct): string {
  return p.units.find((u) => u.isDefaultSale)?.unitId ?? p.pricingUnitId ?? p.baseUnitId;
}

export function lineKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function toSaleLines(lines: CartLine[]): SaleLineInput[] {
  return lines.map((l) => ({ productId: l.product.id, batchId: l.batchId, unitId: l.unitId, qty: l.qty, unitPriceMinor: l.unitPriceMinor, discountBps: l.discountBps, discountMinor: l.discountMinor, note: l.note }));
}

export interface CartHeader {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  walkInName: string;
  walkInPhone: string;
  doctorName: string;
  prescriptionIds: string[];
  billDiscountBps: number;
  billDiscountMinor: number;
  notes: string;
  customFields: Record<string, unknown>;
  label: string;
}

export const emptyHeader: CartHeader = { customerId: null, customerName: '', customerPhone: '', walkInName: '', walkInPhone: '', doctorName: '', prescriptionIds: [], billDiscountBps: 0, billDiscountMinor: 0, notes: '', customFields: {}, label: '' };

export function toHoldInput(header: CartHeader, lines: CartLine[]): HoldSaleInput {
  return {
    customerId: header.customerId ?? undefined,
    walkIn: header.customerId ? undefined : { name: header.walkInName, phone: header.walkInPhone || undefined, email: undefined },
    prescriptionIds: header.prescriptionIds,
    doctorName: header.doctorName,
    lines: toSaleLines(lines),
    billDiscountBps: header.billDiscountBps,
    billDiscountMinor: header.billDiscountMinor,
    notes: header.notes,
    customFields: header.customFields,
    label: header.label,
  };
}

/** Quantity helpers: qty in unit → base and back. */
export function unitFactor(p: CartProduct, unitId: string): number {
  return p.units.find((u) => u.unitId === unitId)?.factorToBase ?? 1;
}
