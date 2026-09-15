import type { RequestHandler } from 'express';
import type { FeatureKey } from '@pharmaos/shared';
import { AuthError, PlanLimitError } from '@/lib/errors';
import { hasFeature } from '@/modules/subscriptions/subscriptions.service';

const FEATURE_LABELS: Record<FeatureKey, string> = {
  multiOutlet: 'Multiple outlets',
  stockTransfers: 'Stock transfers',
  customRoles: 'Custom roles',
  customFields: 'Custom fields',
  templateDesigner: 'Template designer',
  emailInvoices: 'Email invoices',
  importExport: 'Import & export',
  advancedReports: 'Advanced reports',
  auditLog: 'Audit log',
  apiAccess: 'API access',
  prescriptions: 'Prescriptions',
  notificationsEmail: 'Email notifications',
};

/**
 * Server-side feature entitlement. Runs after `authenticate`. Denies with PLAN_LIMIT (402) so the
 * UI can show an upgrade prompt instead of a permission error.
 */
export function requireFeature(feature: FeatureKey): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.ctx) throw new AuthError();
      const ok = await hasFeature(req.ctx.organizationId, feature);
      if (!ok) throw new PlanLimitError(`${FEATURE_LABELS[feature]} is not included in your plan. Upgrade to use it.`);
      next();
    } catch (err) {
      next(err);
    }
  };
}
