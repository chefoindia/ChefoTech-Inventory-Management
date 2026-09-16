import type { PlanDto, PlanKey, FeatureKey } from './schemas/analytics';

const ALL_FEATURES: FeatureKey[] = ['multiOutlet', 'stockTransfers', 'customRoles', 'customFields', 'templateDesigner', 'emailInvoices', 'importExport', 'advancedReports', 'auditLog', 'apiAccess', 'prescriptions', 'notificationsEmail'];

/**
 * Plan catalogue: the single source of truth for the API (entitlement checks, Razorpay checkout)
 * and the public pricing page. Limits and features are enforced server-side.
 */
export const PLANS: Record<PlanKey, PlanDto> = {
  trial: {
    key: 'trial',
    name: 'Trial',
    description: 'Every feature for 14 days.',
    priceMinorPerMonth: 0,
    limits: { outlets: 3, users: 10, products: 20_000, storageMb: 2048, invoicesPerMonth: 5_000 },
    features: ALL_FEATURES,
    trialDays: 14,
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    description: 'Single-store essentials.',
    priceMinorPerMonth: 99_900,
    limits: { outlets: 1, users: 3, products: 5_000, storageMb: 1024, invoicesPerMonth: 3_000 },
    features: ['emailInvoices', 'prescriptions', 'importExport'],
  },
  standard: {
    key: 'standard',
    name: 'Standard',
    description: 'For growing pharmacies with a few outlets.',
    priceMinorPerMonth: 249_900,
    limits: { outlets: 3, users: 10, products: 25_000, storageMb: 5120, invoicesPerMonth: 20_000 },
    features: ['multiOutlet', 'stockTransfers', 'customFields', 'templateDesigner', 'emailInvoices', 'importExport', 'advancedReports', 'auditLog', 'prescriptions', 'notificationsEmail'],
  },
  business: {
    key: 'business',
    name: 'Business',
    description: 'Chains that need control and consolidation.',
    priceMinorPerMonth: 599_900,
    limits: { outlets: 15, users: 60, products: 100_000, storageMb: 20_480, invoicesPerMonth: 200_000 },
    features: ALL_FEATURES,
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Custom limits and support.',
    priceMinorPerMonth: null,
    limits: { outlets: 1_000, users: 5_000, products: 1_000_000, storageMb: 512_000, invoicesPerMonth: 10_000_000 },
    features: ALL_FEATURES,
  },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  multiOutlet: 'Multiple outlets',
  stockTransfers: 'Stock transfers between outlets',
  customRoles: 'Custom roles',
  customFields: 'Custom fields',
  templateDesigner: 'Invoice & document designer',
  emailInvoices: 'Email invoices and statements',
  importExport: 'Import & export (CSV/Excel)',
  advancedReports: 'Advanced reports',
  auditLog: 'Audit log',
  apiAccess: 'API access',
  prescriptions: 'Prescription records',
  notificationsEmail: 'Email alerts',
};

export function planFor(key: string | undefined): PlanDto {
  return PLANS[(key as PlanKey) in PLANS ? (key as PlanKey) : 'trial'];
}
