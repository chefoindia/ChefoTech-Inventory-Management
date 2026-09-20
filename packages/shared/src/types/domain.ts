import type { Address } from '../schemas/common';
import type { AttachmentRef } from './api';
import type { DrugSchedule } from '../schemas/product';
import type { CustomFieldEntity, CustomFieldType } from '../schemas/custom-field';
import type { EntityStatus, PaymentMethod } from '../constants/enums';

export interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  description: string;
  productCount?: number;
  status: EntityStatus;
}

export interface UnitDto {
  id: string;
  name: string;
  abbreviation: string;
  allowsDecimal: boolean;
  isSystem: boolean;
  status: EntityStatus;
}

export interface ProductUnitDto {
  unitId: string;
  unitName: string;
  abbreviation: string;
  factorToBase: number;
  isDefaultPurchase: boolean;
  isDefaultSale: boolean;
  allowLooseSale: boolean;
}

export interface ProductBarcodeDto {
  code: string;
  unitId?: string;
  isPrimary: boolean;
  source: 'manufacturer' | 'internal';
}

export interface ProductDto {
  id: string;
  name: string;
  brandName: string;
  genericName: string;
  composition: string;
  manufacturer: string;
  categoryId: string | null;
  categoryName?: string;
  dosageForm: string;
  strength: string;
  packLabel: string;
  hsnCode: string;
  tax: { rateBps: number; cessBps: number };
  schedule: DrugSchedule;
  requiresPrescription: boolean;
  baseUnitId: string;
  pricingUnitId: string;
  units: ProductUnitDto[];
  pricing: { mrpMinor: number; sellingPriceMinor: number; purchasePriceMinor?: number };
  stockRules: { reorderLevelBase: number; minStockBase: number; maxStockBase: number };
  barcodes: ProductBarcodeDto[];
  rackLocation: string;
  images: AttachmentRef[];
  documents: AttachmentRef[];
  tags: string[];
  notes: string;
  customFields: Record<string, unknown>;
  status: EntityStatus;
  /** Present on list/detail when the caller has inventory.view and an active outlet. */
  stockBase?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSearchHit {
  id: string;
  name: string;
  brandName: string;
  genericName: string;
  composition: string;
  manufacturer: string;
  packLabel: string;
  schedule: DrugSchedule;
  requiresPrescription: boolean;
  tax: { rateBps: number; cessBps: number };
  hsnCode: string;
  baseUnitId: string;
  pricingUnitId: string;
  units: ProductUnitDto[];
  pricing: { mrpMinor: number; sellingPriceMinor: number };
  barcodes: ProductBarcodeDto[];
  /** Total sellable stock at the active outlet in base units (POS mode). */
  stockBase?: number;
  batches?: BatchStockDto[];
  /** Set when the scanned code was a batch LABEL: the exact pack, so its own prices apply. */
  matchedBatchId?: string;
}

export interface BatchStockDto {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  mfgDate?: string | null;
  mrpMinor: number;
  sellingPriceMinor: number;
  purchasePriceMinor?: number;
  pricingUnitFactor: number;
  qtyBase: number;
  isExpired: boolean;
  daysToExpiry: number;
}

export interface SupplierDto {
  id: string;
  name: string;
  code: string;
  contactPerson: string;
  phone: string;
  altPhone: string;
  email: string;
  address: Address;
  gstin: string;
  stateCode: string;
  pan: string;
  drugLicenseNo: string;
  paymentTermsDays: number;
  openingBalanceMinor: number;
  balanceMinor: number;
  bank?: { accountName: string; accountNumber: string; ifsc: string; upiId: string };
  documents: AttachmentRef[];
  notes: string;
  customFields: Record<string, unknown>;
  status: EntityStatus;
  createdAt: string;
}

export interface CustomerDto {
  id: string;
  name: string;
  phone: string;
  altPhone: string;
  email: string;
  address: Address;
  gstin: string;
  stateCode: string;
  dateOfBirth: string | null;
  gender: string;
  creditLimitMinor: number;
  creditDays: number | null;
  openingBalanceMinor: number;
  balanceMinor: number;
  defaultDiscountBps: number;
  tags: string[];
  documents: AttachmentRef[];
  notes: string;
  customFields: Record<string, unknown>;
  status: EntityStatus;
  lastPurchaseAt?: string | null;
  totalPurchasesMinor?: number;
  createdAt: string;
}

export interface LedgerEntryDto {
  id: string;
  date: string;
  type: string;
  refType: string;
  refId: string | null;
  refNumber: string;
  debitMinor: number;
  creditMinor: number;
  balanceAfterMinor: number;
  note: string;
  createdBy?: { id: string; name: string } | null;
}

export interface PartyPaymentDto {
  id: string;
  number: string;
  partyId: string;
  partyName: string;
  date: string;
  method: PaymentMethod;
  amountMinor: number;
  reference: string;
  notes: string;
  allocations: { documentId: string; documentNumber: string; amountMinor: number }[];
  unallocatedMinor: number;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
}

export interface CustomFieldDto {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  defaultValue?: unknown;
  options: { label: string; value: string }[];
  validation?: { min?: number; max?: number; maxLength?: number; pattern?: string };
  visibility: { list: boolean; form: boolean; print: boolean };
  sortOrder: number;
  helpText: string;
  status: 'active' | 'archived';
}

export interface SignedUploadDto {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  resourceType: 'image' | 'raw' | 'auto';
  type: 'upload' | 'authenticated';
  uploadUrl: string;
  maxBytes: number;
  allowedFormats: string[];
}
