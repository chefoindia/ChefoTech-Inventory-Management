import type { BatchStockDto } from './domain';
import type { AttachmentRef } from './api';

export interface StockOverviewRow {
  productId: string;
  name: string;
  packLabel: string;
  manufacturer: string;
  categoryName: string;
  baseUnit: string;
  pricingUnit: string;
  pricingUnitFactor: number;
  onHandBase: number;
  sellableBase: number;
  expiredBase: number;
  nearExpiryBase: number;
  inTransitBase: number;
  reorderLevelBase: number;
  minStockBase: number;
  isLow: boolean;
  batchCount: number;
  /** Only when the caller may view valuation. */
  valuationCostMinor?: number;
  valuationMrpMinor?: number;
  nextExpiry: string | null;
}

export interface BatchRow extends BatchStockDto {
  productId: string;
  productName: string;
  packLabel: string;
  pricingUnit: string;
  outletId: string;
  status: 'active' | 'blocked';
  blockReason: string;
  supplierName?: string;
  inTransitBase: number;
}

export interface MovementRow {
  id: string;
  createdAt: string;
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  qtyBaseDelta: number;
  balanceAfterBase: number;
  reason: string;
  refType: string;
  refId: string | null;
  refNumber: string;
  note: string;
  user: { id: string; name: string } | null;
}

export interface AdjustmentLineDto {
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  unitId: string;
  unitName: string;
  qtyDelta: number;
  qtyBaseDelta: number;
  unitCostMinor: number;
  valueMinor: number;
  note: string;
}

export interface AdjustmentDto {
  id: string;
  number: string;
  outletId: string;
  type: string;
  reason: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  lines: AdjustmentLineDto[];
  totalValueMinor: number;
  notes: string;
  attachments: AttachmentRef[];
  requestedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  rejectionReason: string;
  createdAt: string;
}

export interface TransferLineDto {
  lineId: string;
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  unitId: string;
  unitName: string;
  factorToBase: number;
  qtyRequestedBase: number;
  qtyDispatchedBase: number;
  qtyReceivedBase: number;
  discrepancyNote: string;
}

export interface TransferDto {
  id: string;
  number: string;
  fromOutletId: string;
  fromOutletName: string;
  toOutletId: string;
  toOutletName: string;
  status: 'requested' | 'approved' | 'dispatched' | 'received' | 'partially_received' | 'cancelled';
  lines: TransferLineDto[];
  notes: string;
  requestedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  dispatchedBy: { id: string; name: string } | null;
  receivedBy: { id: string; name: string } | null;
  requestedAt: string;
  approvedAt: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface ExpirySummary {
  expired: { batches: number; qtyBase: number; valueMinor?: number };
  buckets: { days: number; batches: number; qtyBase: number; valueMinor?: number }[];
}
