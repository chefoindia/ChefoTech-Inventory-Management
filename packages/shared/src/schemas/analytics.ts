import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './common';

/* ---------------------------------------------------------------- reports */

export const REPORT_KEYS = [
  'sales.summary',
  'sales.daily',
  'sales.byProduct',
  'sales.byCategory',
  'sales.byStaff',
  'sales.byOutlet',
  'sales.byPayment',
  'sales.byCustomer',
  'sales.returns',
  'purchases.summary',
  'purchases.bySupplier',
  'purchases.byProduct',
  'purchases.returns',
  'inventory.stock',
  'inventory.valuation',
  'inventory.lowStock',
  'inventory.deadStock',
  'inventory.fastMoving',
  'inventory.slowMoving',
  'inventory.batches',
  'inventory.expiry',
  'inventory.movements',
  'inventory.looseSales',
  'finance.profit',
  'finance.gst',
  'finance.hsn',
  'finance.outstanding',
  'finance.payables',
  'finance.collections',
  'finance.discounts',
  'staff.activity',
  'pharmacy.scheduleRegister',
  'business.summary',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_CATALOGUE: { key: ReportKey; group: string; label: string; description: string; needsDates: boolean; sensitive?: boolean }[] = [
  { key: 'business.summary', group: 'Business', label: 'Business summary', description: 'Revenue, purchases, profit, outstanding and stock at a glance.', needsDates: true, sensitive: true },
  { key: 'sales.summary', group: 'Sales', label: 'Sales summary', description: 'Totals, tax, discounts and payment mix.', needsDates: true },
  { key: 'sales.daily', group: 'Sales', label: 'Daily sales', description: 'One row per day with invoices, revenue and tax.', needsDates: true },
  { key: 'sales.byProduct', group: 'Sales', label: 'Product-wise sales', description: 'Quantity and revenue per product.', needsDates: true },
  { key: 'sales.byCategory', group: 'Sales', label: 'Category-wise sales', description: 'Revenue per category.', needsDates: true },
  { key: 'sales.byStaff', group: 'Sales', label: 'Staff-wise sales', description: 'Invoices and revenue per user.', needsDates: true },
  { key: 'sales.byOutlet', group: 'Sales', label: 'Outlet-wise sales', description: 'Compare outlets (organization level).', needsDates: true },
  { key: 'sales.byPayment', group: 'Sales', label: 'Payment-wise sales', description: 'Cash, UPI, card, credit.', needsDates: true },
  { key: 'sales.byCustomer', group: 'Sales', label: 'Customer-wise sales', description: 'Top customers by revenue.', needsDates: true },
  { key: 'sales.returns', group: 'Sales', label: 'Sales returns', description: 'Returned items, reasons and values.', needsDates: true },
  { key: 'purchases.summary', group: 'Purchases', label: 'Purchase summary', description: 'Totals and tax on purchases.', needsDates: true, sensitive: true },
  { key: 'purchases.bySupplier', group: 'Purchases', label: 'Supplier-wise purchases', description: 'Value purchased per supplier.', needsDates: true, sensitive: true },
  { key: 'purchases.byProduct', group: 'Purchases', label: 'Product-wise purchases', description: 'Quantity and cost per product.', needsDates: true, sensitive: true },
  { key: 'purchases.returns', group: 'Purchases', label: 'Purchase returns', description: 'Goods returned to suppliers.', needsDates: true, sensitive: true },
  { key: 'inventory.stock', group: 'Inventory', label: 'Current stock', description: 'On-hand, sellable and expired per product.', needsDates: false },
  { key: 'inventory.valuation', group: 'Inventory', label: 'Stock valuation', description: 'Stock value at cost and MRP.', needsDates: false, sensitive: true },
  { key: 'inventory.lowStock', group: 'Inventory', label: 'Low stock', description: 'Products at or below reorder level.', needsDates: false },
  { key: 'inventory.deadStock', group: 'Inventory', label: 'Dead stock', description: 'In stock but not sold in the period.', needsDates: true },
  { key: 'inventory.fastMoving', group: 'Inventory', label: 'Fast-moving', description: 'Highest quantity sold.', needsDates: true },
  { key: 'inventory.slowMoving', group: 'Inventory', label: 'Slow-moving', description: 'Lowest quantity sold among stocked items.', needsDates: true },
  { key: 'inventory.batches', group: 'Inventory', label: 'Batch-wise stock', description: 'Every batch with expiry and quantity.', needsDates: false },
  { key: 'inventory.expiry', group: 'Inventory', label: 'Expiry report', description: 'Expired and near-expiry batches.', needsDates: false },
  { key: 'inventory.movements', group: 'Inventory', label: 'Stock movement', description: 'Every stock change with reason.', needsDates: true },
  { key: 'inventory.looseSales', group: 'Pharmacy', label: 'Loose-unit sales', description: 'Sales in units smaller than the pack.', needsDates: true },
  { key: 'pharmacy.scheduleRegister', group: 'Pharmacy', label: 'Schedule H/H1/X register', description: 'Prescription drug sales with doctor and customer.', needsDates: true },
  { key: 'finance.profit', group: 'Finance', label: 'Gross profit', description: 'Revenue, cost of goods and margin per product.', needsDates: true, sensitive: true },
  { key: 'finance.gst', group: 'Finance', label: 'GST summary', description: 'Output and input tax by rate.', needsDates: true },
  { key: 'finance.hsn', group: 'Finance', label: 'HSN summary', description: 'Taxable value and tax by HSN code (GSTR-1 HSN).', needsDates: true },
  { key: 'finance.outstanding', group: 'Finance', label: 'Customer outstanding', description: 'Receivables with ageing.', needsDates: false },
  { key: 'finance.payables', group: 'Finance', label: 'Supplier payables', description: 'Payables with due dates.', needsDates: false, sensitive: true },
  { key: 'finance.collections', group: 'Finance', label: 'Payment collections', description: 'Receipts by day and method.', needsDates: true },
  { key: 'finance.discounts', group: 'Finance', label: 'Discounts given', description: 'Discounts by staff and invoice.', needsDates: true },
  { key: 'staff.activity', group: 'Staff', label: 'Staff activity', description: 'Actions per user from the audit trail.', needsDates: true },
];

export const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Organization-wide when omitted and the caller has access to all outlets. */
  outletId: objectIdSchema.optional(),
  categoryId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export interface ReportColumn {
  key: string;
  label: string;
  format?: 'money' | 'number' | 'percent' | 'date' | 'text';
}

export interface ReportResult {
  key: ReportKey;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
  meta: { from: string | null; to: string | null; outletId: string | null; generatedAt: string; rowCount: number };
}

/* ---------------------------------------------------------------- dashboard */

export const dashboardQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  outletId: objectIdSchema.optional(),
});

export interface DashboardSummary {
  period: { from: string; to: string };
  sales: { revenueMinor: number; invoices: number; averageBillMinor: number; taxMinor: number; discountMinor: number; returnsMinor: number; previousRevenueMinor: number };
  purchases: { valueMinor: number; invoices: number; previousValueMinor: number };
  profit?: { grossProfitMinor: number; marginBps: number };
  receivables: { outstandingMinor: number; overdueMinor: number; customers: number };
  payables: { outstandingMinor: number; overdueMinor: number; suppliers: number };
  inventory: { lowStock: number; expired: number; nearExpiry: number; valuationCostMinor?: number; products: number };
  today: { revenueMinor: number; invoices: number; collectionsMinor: number };
  trend: { date: string; revenueMinor: number; invoices: number; purchasesMinor: number }[];
  paymentMix: { method: string; amountMinor: number }[];
  topProducts: { productId: string; name: string; qtyBase: number; revenueMinor: number }[];
  outlets: { outletId: string; name: string; revenueMinor: number; invoices: number }[];
  recentActivity: { id: string; action: string; summary: string; user: string; at: string }[];
  alerts: { type: string; severity: 'info' | 'warning' | 'danger'; title: string; count: number; href: string }[];
}

/* ---------------------------------------------------------------- notifications */

export const NOTIFICATION_TYPES = [
  'stock.low',
  'stock.critical',
  'stock.expiringSoon',
  'stock.expired',
  'credit.overdue',
  'credit.dueSoon',
  'payable.due',
  'purchase.received',
  'purchase.pendingGrn',
  'sale.cancelled',
  'return.created',
  'adjustment.pendingApproval',
  'transfer.incoming',
  'licence.expiring',
  'system.importCompleted',
  'system.emailFailed',
  'user.joined',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['inApp', 'email', 'sms', 'whatsapp', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
  entityType: string | null;
  entityId: string | null;
  href: string | null;
  outletId: string | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationListQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().default(false),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

export const notificationRuleSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  enabled: z.boolean().default(true),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).default(['inApp']),
  /** Role keys that receive it (empty = users with the relevant permission). */
  roleKeys: z.array(z.string().max(60)).max(20).default([]),
  /** Type-specific thresholds (e.g. days before expiry, days overdue). */
  threshold: z.number().int().min(0).max(3650).optional(),
});
export type NotificationRuleInput = z.infer<typeof notificationRuleSchema>;

export const notificationRulesUpdateSchema = z.object({ rules: z.array(notificationRuleSchema).max(50) });

export interface NotificationRuleDto extends NotificationRuleInput {
  label: string;
  description: string;
  defaultThreshold?: number;
  thresholdLabel?: string;
}

export const NOTIFICATION_CATALOGUE: Record<NotificationType, { label: string; description: string; severity: 'info' | 'warning' | 'danger' | 'success'; permission: string; defaultThreshold?: number; thresholdLabel?: string }> = {
  'stock.low': { label: 'Low stock', description: 'A product fell to or below its reorder level.', severity: 'warning', permission: 'inventory.view' },
  'stock.critical': { label: 'Out of stock', description: 'A product with a reorder level has no sellable stock.', severity: 'danger', permission: 'inventory.view' },
  'stock.expiringSoon': { label: 'Expiring soon', description: 'Batches expiring within the threshold.', severity: 'warning', permission: 'inventory.view', defaultThreshold: 30, thresholdLabel: 'days before expiry' },
  'stock.expired': { label: 'Expired stock', description: 'Batches that have expired with stock on hand.', severity: 'danger', permission: 'inventory.view' },
  'credit.overdue': { label: 'Customer overdue', description: 'Credit invoices past their due date.', severity: 'danger', permission: 'customers.viewLedger', defaultThreshold: 0, thresholdLabel: 'days past due' },
  'credit.dueSoon': { label: 'Customer payment due soon', description: 'Credit invoices due within the threshold.', severity: 'info', permission: 'customers.viewLedger', defaultThreshold: 3, thresholdLabel: 'days before due' },
  'payable.due': { label: 'Supplier payment due', description: 'Purchase invoices due within the threshold.', severity: 'warning', permission: 'suppliers.viewLedger', defaultThreshold: 3, thresholdLabel: 'days before due' },
  'purchase.received': { label: 'Goods received', description: 'A GRN was confirmed.', severity: 'success', permission: 'purchases.view' },
  'purchase.pendingGrn': { label: 'Purchase awaiting receipt', description: 'Purchases not received within the threshold.', severity: 'info', permission: 'purchases.view', defaultThreshold: 7, thresholdLabel: 'days since invoice' },
  'sale.cancelled': { label: 'Invoice cancelled', description: 'An invoice was cancelled.', severity: 'warning', permission: 'sales.view' },
  'return.created': { label: 'Return recorded', description: 'A sales or purchase return was created.', severity: 'info', permission: 'sales.view' },
  'adjustment.pendingApproval': { label: 'Adjustment awaiting approval', description: 'A stock adjustment needs approval.', severity: 'warning', permission: 'inventory.approveAdjustment' },
  'transfer.incoming': { label: 'Incoming transfer', description: 'A transfer was dispatched to your outlet.', severity: 'info', permission: 'inventory.transfer.receive' },
  'licence.expiring': { label: 'Drug licence expiring', description: 'An outlet drug licence expires within the threshold.', severity: 'danger', permission: 'outlets.view', defaultThreshold: 30, thresholdLabel: 'days before expiry' },
  'system.importCompleted': { label: 'Import completed', description: 'A data import finished.', severity: 'success', permission: 'data.import' },
  'system.emailFailed': { label: 'Email failed', description: 'An invoice email could not be delivered.', severity: 'warning', permission: 'sales.view' },
  'user.joined': { label: 'Team member joined', description: 'An invited user accepted.', severity: 'info', permission: 'users.view' },
};

/* ---------------------------------------------------------------- subscriptions */

export const PLAN_KEYS = ['trial', 'starter', 'standard', 'business', 'enterprise'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const FEATURE_KEYS = [
  'multiOutlet',
  'stockTransfers',
  'customRoles',
  'customFields',
  'templateDesigner',
  'emailInvoices',
  'importExport',
  'advancedReports',
  'auditLog',
  'apiAccess',
  'prescriptions',
  'notificationsEmail',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface PlanDto {
  key: PlanKey;
  name: string;
  description: string;
  priceMinorPerMonth: number | null;
  limits: { outlets: number; users: number; products: number; storageMb: number; invoicesPerMonth: number };
  features: FeatureKey[];
  trialDays?: number;
}

export interface SubscriptionDto {
  plan: PlanDto;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  usage: { outlets: number; users: number; products: number; invoicesThisMonth: number; storageMb: number };
  limits: PlanDto['limits'];
  features: FeatureKey[];
  history: { at: string; from: string; to: string; by: string }[];
}

export const changePlanSchema = z.object({ planKey: z.enum(PLAN_KEYS) });
