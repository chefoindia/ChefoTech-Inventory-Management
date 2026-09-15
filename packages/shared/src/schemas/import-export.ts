import { z } from 'zod';
import { paginationQuerySchema } from './common';

export const IMPORT_ENTITIES = ['products', 'customers', 'suppliers', 'openingStock'] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

/** Column definitions drive templates, validation messages and the mapping UI. */
export interface ImportColumn {
  key: string;
  label: string;
  required: boolean;
  example: string;
  description?: string;
}

export const IMPORT_COLUMNS: Record<ImportEntity, ImportColumn[]> = {
  products: [
    { key: 'name', label: 'Product name', required: true, example: 'Montek LC Tablet' },
    { key: 'brandName', label: 'Brand', required: false, example: 'Montek' },
    { key: 'genericName', label: 'Generic name', required: false, example: 'Montelukast + Levocetirizine' },
    { key: 'composition', label: 'Composition', required: false, example: 'Montelukast 10mg' },
    { key: 'manufacturer', label: 'Manufacturer', required: false, example: 'Sun Pharma' },
    { key: 'category', label: 'Category', required: false, example: 'Tablets', description: 'Created if missing' },
    { key: 'dosageForm', label: 'Dosage form', required: false, example: 'tablet' },
    { key: 'strength', label: 'Strength', required: false, example: '10mg' },
    { key: 'packLabel', label: 'Pack', required: false, example: '1x10' },
    { key: 'hsnCode', label: 'HSN', required: false, example: '3004' },
    { key: 'gstRate', label: 'GST %', required: false, example: '12' },
    { key: 'schedule', label: 'Schedule', required: false, example: 'H' },
    { key: 'baseUnit', label: 'Base unit', required: true, example: 'Tablet', description: 'Smallest sellable unit' },
    { key: 'packUnit', label: 'Pack unit', required: false, example: 'Strip', description: 'Unit prices are quoted in' },
    { key: 'packSize', label: 'Pack size', required: false, example: '10', description: 'Base units per pack unit' },
    { key: 'mrp', label: 'MRP', required: false, example: '185.00', description: 'Per pack unit' },
    { key: 'sellingPrice', label: 'Selling price', required: false, example: '185.00' },
    { key: 'purchasePrice', label: 'Purchase price', required: false, example: '132.00' },
    { key: 'barcode', label: 'Barcode', required: false, example: '8901234567890' },
    { key: 'reorderLevel', label: 'Reorder level', required: false, example: '50', description: 'In base units' },
    { key: 'rackLocation', label: 'Rack', required: false, example: 'A-12' },
  ],
  customers: [
    { key: 'name', label: 'Name', required: true, example: 'Ravi Kumar' },
    { key: 'phone', label: 'Phone', required: true, example: '9876543210' },
    { key: 'email', label: 'Email', required: false, example: 'ravi@example.com' },
    { key: 'address', label: 'Address', required: false, example: '12 MG Road' },
    { key: 'city', label: 'City', required: false, example: 'Mumbai' },
    { key: 'pincode', label: 'PIN', required: false, example: '400001' },
    { key: 'gstin', label: 'GSTIN', required: false, example: '' },
    { key: 'creditLimit', label: 'Credit limit', required: false, example: '5000' },
    { key: 'openingBalance', label: 'Opening balance', required: false, example: '0', description: 'Amount the customer owes' },
  ],
  suppliers: [
    { key: 'name', label: 'Name', required: true, example: 'Medico Distributors' },
    { key: 'phone', label: 'Phone', required: false, example: '9876543210' },
    { key: 'email', label: 'Email', required: false, example: '' },
    { key: 'contactPerson', label: 'Contact person', required: false, example: '' },
    { key: 'gstin', label: 'GSTIN', required: false, example: '27ABCDE1234F1Z5' },
    { key: 'stateCode', label: 'State code', required: false, example: '27' },
    { key: 'paymentTermsDays', label: 'Payment terms (days)', required: false, example: '30' },
    { key: 'openingBalance', label: 'Opening balance', required: false, example: '0', description: 'Amount you owe' },
  ],
  openingStock: [
    { key: 'product', label: 'Product name or barcode', required: true, example: 'Montek LC Tablet' },
    { key: 'unit', label: 'Unit', required: false, example: 'Strip', description: 'Defaults to the pack unit' },
    { key: 'qty', label: 'Quantity', required: true, example: '25' },
    { key: 'batchNumber', label: 'Batch', required: true, example: 'B2301' },
    { key: 'expiryDate', label: 'Expiry (YYYY-MM-DD or MM/YYYY)', required: true, example: '2027-03-31' },
    { key: 'mrp', label: 'MRP', required: true, example: '185.00' },
    { key: 'purchasePrice', label: 'Purchase price', required: true, example: '132.00' },
    { key: 'sellingPrice', label: 'Selling price', required: false, example: '185.00' },
  ],
};

export const createImportSchema = z.object({
  entity: z.enum(IMPORT_ENTITIES),
  fileName: z.string().trim().max(200),
  /** Raw CSV text (max ~5 MB). XLSX is converted client-side or via the attachment upload route. */
  csv: z.string().min(1).max(5_000_000),
  /** Optional header mapping: file column → template key. */
  mapping: z.record(z.string(), z.string()).optional(),
  duplicateStrategy: z.enum(['skip', 'update', 'fail']).default('skip'),
});
export type CreateImportInput = z.infer<typeof createImportSchema>;

export interface ImportRowResult {
  row: number;
  status: 'valid' | 'invalid' | 'duplicate';
  errors: string[];
  preview: Record<string, unknown>;
}

export interface ImportJobDto {
  id: string;
  entity: ImportEntity;
  fileName: string;
  status: 'validated' | 'committing' | 'committed' | 'failed' | 'discarded';
  duplicateStrategy: 'skip' | 'update' | 'fail';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  committedRows: number;
  rows: ImportRowResult[];
  error: string;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  committedAt: string | null;
}

export const EXPORT_ENTITIES = ['products', 'customers', 'suppliers', 'stock', 'batches', 'sales', 'purchases', 'movements', 'ledger'] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

export const exportQuerySchema = paginationQuerySchema.pick({ q: true }).extend({
  format: z.enum(['csv', 'xlsx']).default('csv'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  partyId: z.string().optional(),
  partyType: z.enum(['customer', 'supplier']).optional(),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
