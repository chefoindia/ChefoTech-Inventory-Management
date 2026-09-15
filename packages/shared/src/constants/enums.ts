export const ENTITY_STATUSES = ['active', 'inactive', 'archived'] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'invited', 'suspended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const OUTLET_TYPES = ['retail', 'warehouse'] as const;
export type OutletType = (typeof OUTLET_TYPES)[number];

export const DOCUMENT_TYPES = [
  'sale',
  'purchase',
  'grn',
  'salesReturn',
  'purchaseReturn',
  'customerPayment',
  'supplierPayment',
  'transfer',
  'adjustment',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DEFAULT_NUMBERING: Record<DocumentType, { prefix: string; padding: number }> = {
  sale: { prefix: 'INV', padding: 6 },
  purchase: { prefix: 'PI', padding: 6 },
  grn: { prefix: 'GRN', padding: 6 },
  salesReturn: { prefix: 'SR', padding: 6 },
  purchaseReturn: { prefix: 'PR', padding: 6 },
  customerPayment: { prefix: 'RCPT', padding: 6 },
  supplierPayment: { prefix: 'PAY', padding: 6 },
  transfer: { prefix: 'TRF', padding: 6 },
  adjustment: { prefix: 'ADJ', padding: 6 },
};

export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'other', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.password_changed',
  'auth.session_revoked',
  'organization.created',
  'organization.updated',
  'outlet.created',
  'outlet.updated',
  'outlet.archived',
  'user.invited',
  'user.membership_updated',
  'role.created',
  'role.updated',
  'role.deleted',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {});
