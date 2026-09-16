/**
 * Permission catalog. This is the single source of truth for RBAC.
 * Keys are `<module>.<action>`; roles store arrays of these keys.
 * The API enforces them; the web app only uses them to shape the UI.
 */

export interface PermissionDefinition {
  key: string;
  label: string;
  description?: string;
  /** Permissions that expose sensitive data (cost, profit) or allow overrides. */
  sensitive?: boolean;
}

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: PermissionDefinition[];
}

const g = (module: string, label: string, permissions: PermissionDefinition[]): PermissionGroup => ({
  module,
  label,
  permissions,
});

export const PERMISSION_GROUPS: PermissionGroup[] = [
  g('dashboard', 'Dashboard', [
    { key: 'dashboard.view', label: 'View dashboard' },
    { key: 'dashboard.viewProfit', label: 'View profit indicators', sensitive: true },
  ]),
  g('organization', 'Organization', [
    { key: 'organization.view', label: 'View organization profile' },
    { key: 'organization.manage', label: 'Edit organization profile & settings' },
  ]),
  g('outlets', 'Outlets', [
    { key: 'outlets.view', label: 'View outlets' },
    { key: 'outlets.manage', label: 'Create & edit outlets' },
  ]),
  g('users', 'Users & Roles', [
    { key: 'users.view', label: 'View users' },
    { key: 'users.manage', label: 'Invite, edit & deactivate users' },
    { key: 'roles.view', label: 'View roles' },
    { key: 'roles.manage', label: 'Create & edit roles', sensitive: true },
  ]),
  g('products', 'Products & Catalog', [
    { key: 'products.view', label: 'View products' },
    { key: 'products.create', label: 'Create products' },
    { key: 'products.edit', label: 'Edit products' },
    { key: 'products.archive', label: 'Archive products' },
    { key: 'products.viewCost', label: 'View purchase cost', sensitive: true },
    { key: 'products.managePricing', label: 'Change MRP / selling price' },
    { key: 'products.manageBarcodes', label: 'Assign & print barcodes' },
    { key: 'products.manageCategories', label: 'Manage categories & units' },
    { key: 'products.import', label: 'Import products' },
    { key: 'products.export', label: 'Export products' },
  ]),
  g('inventory', 'Inventory', [
    { key: 'inventory.view', label: 'View stock & batches' },
    { key: 'inventory.viewValuation', label: 'View stock valuation', sensitive: true },
    { key: 'inventory.adjust', label: 'Create stock adjustments' },
    { key: 'inventory.approveAdjustment', label: 'Approve stock adjustments', sensitive: true },
    { key: 'inventory.openingStock', label: 'Enter opening stock' },
    { key: 'inventory.writeOff', label: 'Write off expired / damaged stock' },
    { key: 'inventory.transfer.create', label: 'Create stock transfers' },
    { key: 'inventory.transfer.approve', label: 'Approve stock transfers' },
    { key: 'inventory.transfer.dispatch', label: 'Dispatch stock transfers' },
    { key: 'inventory.transfer.receive', label: 'Receive stock transfers' },
    { key: 'inventory.reconcile', label: 'Run stock reconciliation' },
  ]),
  g('purchases', 'Purchases', [
    { key: 'purchases.view', label: 'View purchases' },
    { key: 'purchases.create', label: 'Create purchase invoices' },
    { key: 'purchases.edit', label: 'Edit draft purchases' },
    { key: 'purchases.cancel', label: 'Cancel purchases', sensitive: true },
    { key: 'purchases.receive', label: 'Create GRN' },
    { key: 'purchases.approveGrn', label: 'Confirm GRN (adds stock)' },
    { key: 'purchases.receiveExcess', label: 'Receive more than ordered', sensitive: true },
    { key: 'purchases.return', label: 'Create purchase returns' },
    { key: 'purchases.pay', label: 'Record supplier payments' },
  ]),
  g('sales', 'Sales & POS', [
    { key: 'sales.view', label: 'View sales' },
    { key: 'sales.create', label: 'Create sales (POS)' },
    { key: 'sales.hold', label: 'Hold & resume bills' },
    { key: 'sales.cancel', label: 'Cancel sales', sensitive: true },
    { key: 'sales.discount', label: 'Apply discounts within limit' },
    { key: 'sales.overrideDiscount', label: 'Override discount limit', sensitive: true },
    { key: 'sales.overridePrice', label: 'Override selling price', sensitive: true },
    { key: 'sales.chooseBatch', label: 'Choose a non-FEFO batch' },
    { key: 'sales.credit', label: 'Sell on credit' },
    { key: 'sales.return', label: 'Create sales returns' },
    { key: 'sales.collectPayment', label: 'Collect customer payments' },
    { key: 'sales.email', label: 'Email invoices' },
    { key: 'sales.print', label: 'Print invoices' },
  ]),
  g('customers', 'Customers', [
    { key: 'customers.view', label: 'View customers' },
    { key: 'customers.manage', label: 'Create & edit customers' },
    { key: 'customers.viewLedger', label: 'View customer ledger' },
    { key: 'customers.adjustBalance', label: 'Adjust customer balance', sensitive: true },
    { key: 'customers.overrideCreditLimit', label: 'Override credit limit', sensitive: true },
    { key: 'customers.export', label: 'Export customers' },
  ]),
  g('suppliers', 'Suppliers', [
    { key: 'suppliers.view', label: 'View suppliers' },
    { key: 'suppliers.manage', label: 'Create & edit suppliers' },
    { key: 'suppliers.viewLedger', label: 'View supplier ledger' },
    { key: 'suppliers.adjustBalance', label: 'Adjust supplier balance', sensitive: true },
    { key: 'suppliers.export', label: 'Export suppliers' },
  ]),
  g('prescriptions', 'Prescriptions', [
    { key: 'prescriptions.view', label: 'View prescriptions' },
    { key: 'prescriptions.manage', label: 'Upload & edit prescriptions' },
  ]),
  g('reports', 'Reports', [
    { key: 'reports.view', label: 'View reports' },
    { key: 'reports.viewProfit', label: 'View profit & margin reports', sensitive: true },
    { key: 'reports.export', label: 'Export reports' },
  ]),
  g('documents', 'Documents & Templates', [
    { key: 'templates.view', label: 'View document templates' },
    { key: 'templates.manage', label: 'Design & manage templates' },
  ]),
  g('notifications', 'Notifications', [
    { key: 'notifications.view', label: 'View notifications' },
    { key: 'notifications.manage', label: 'Configure notification rules' },
  ]),
  g('settings', 'Settings', [
    { key: 'settings.view', label: 'View settings' },
    { key: 'settings.manage', label: 'Change business settings' },
    { key: 'settings.customFields', label: 'Manage custom fields' },
    { key: 'settings.numbering', label: 'Manage document numbering' },
    { key: 'settings.tax', label: 'Manage tax configuration' },
  ]),
  g('audit', 'Audit', [{ key: 'audit.view', label: 'View audit logs', sensitive: true }]),
  g('data', 'Data', [
    { key: 'data.import', label: 'Import data' },
    { key: 'data.export', label: 'Export organization data', sensitive: true },
  ]),
  g('ai', 'AI assistant', [
    { key: 'ai.use', label: 'Use the AI assistant', description: 'The assistant can only do what this user can already do.' },
    { key: 'ai.manage', label: 'Configure AI & Gemini key', sensitive: true },
  ]),
];

export const ALL_PERMISSIONS: readonly string[] = PERMISSION_GROUPS.flatMap((grp) =>
  grp.permissions.map((p) => p.key),
);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

export type Permission = (typeof ALL_PERMISSIONS)[number];

export function isPermission(key: string): boolean {
  return PERMISSION_SET.has(key);
}

/** System roles seeded into every organization. Owner is implicit (all permissions). */
export interface SystemRoleDefinition {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

const pick = (...prefixes: string[]) =>
  ALL_PERMISSIONS.filter((p) => prefixes.some((pre) => p === pre || p.startsWith(pre + '.')));

const without = (list: string[], ...keys: string[]) => list.filter((p) => !keys.includes(p));

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Full access to everything in the organization.',
    permissions: [...ALL_PERMISSIONS],
  },
  {
    key: 'org_admin',
    name: 'Organization Admin',
    description: 'Manages settings, users, outlets and all operations.',
    permissions: without([...ALL_PERMISSIONS], 'data.export'),
  },
  {
    key: 'outlet_manager',
    name: 'Outlet Manager',
    description: 'Runs day-to-day operations of assigned outlets.',
    permissions: without(
      [
        'ai.use',
        ...pick('dashboard', 'products', 'inventory', 'purchases', 'sales', 'customers', 'suppliers', 'prescriptions', 'reports', 'notifications'),
        'outlets.view',
        'users.view',
        'settings.view',
        'templates.view',
      ],
      'products.import',
      'inventory.approveAdjustment',
    ),
  },
  {
    key: 'pharmacist',
    name: 'Pharmacist',
    description: 'Dispenses medicines, manages prescriptions and stock.',
    permissions: [
      'ai.use',
      'dashboard.view',
      ...without(pick('products'), 'products.viewCost', 'products.import', 'products.export', 'products.archive'),
      'inventory.view',
      'inventory.adjust',
      'inventory.writeOff',
      'inventory.transfer.create',
      'inventory.transfer.receive',
      ...without(pick('sales'), 'sales.cancel', 'sales.overrideDiscount', 'sales.overridePrice'),
      'customers.view',
      'customers.manage',
      'customers.viewLedger',
      ...pick('prescriptions'),
      'reports.view',
      'notifications.view',
    ],
  },
  {
    key: 'billing_staff',
    name: 'Billing Staff',
    description: 'Creates sales at the counter and collects payments.',
    permissions: [
      'ai.use',
      'products.view',
      'inventory.view',
      'sales.view',
      'sales.create',
      'sales.hold',
      'sales.discount',
      'sales.collectPayment',
      'sales.email',
      'sales.print',
      'customers.view',
      'customers.manage',
      'prescriptions.view',
      'prescriptions.manage',
      'notifications.view',
    ],
  },
  {
    key: 'inventory_manager',
    name: 'Inventory Manager',
    description: 'Owns stock accuracy, batches, expiry and transfers.',
    permissions: [
      'ai.use',
      'dashboard.view',
      ...without(pick('products'), 'products.managePricing'),
      ...pick('inventory'),
      'purchases.view',
      'purchases.receive',
      'purchases.approveGrn',
      'purchases.return',
      'suppliers.view',
      'reports.view',
      'reports.export',
      'notifications.view',
    ],
  },
  {
    key: 'purchase_manager',
    name: 'Purchase Manager',
    description: 'Manages suppliers, purchase invoices and GRNs.',
    permissions: [
      'ai.use',
      'dashboard.view',
      'products.view',
      'products.viewCost',
      'products.managePricing',
      'inventory.view',
      ...pick('purchases'),
      ...pick('suppliers'),
      'reports.view',
      'reports.export',
      'notifications.view',
    ],
  },
  {
    key: 'accountant',
    name: 'Accountant',
    description: 'Read-only operations with full financial visibility and payment recording.',
    permissions: [
      'ai.use',
      'dashboard.view',
      'dashboard.viewProfit',
      'products.view',
      'products.viewCost',
      'inventory.view',
      'inventory.viewValuation',
      'purchases.view',
      'purchases.pay',
      'sales.view',
      'sales.collectPayment',
      ...pick('customers'),
      ...pick('suppliers'),
      ...pick('reports'),
      'audit.view',
      'notifications.view',
      'settings.view',
    ],
  },
];
