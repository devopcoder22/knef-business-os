export const PERMISSIONS = {
  PRODUCTS: {
    VIEW: 'products.view',
    CREATE: 'products.create',
    EDIT: 'products.edit',
    DELETE: 'products.delete',
    IMPORT: 'products.import',
    EXPORT: 'products.export',
  },
  INVENTORY: {
    VIEW: 'inventory.view',
    ADJUST: 'inventory.adjust',
    TRANSFER: 'inventory.transfer',
    COUNT: 'inventory.count',
    VIEW_COST: 'inventory.view_cost',
  },
  SUPPLIERS: {
    VIEW: 'suppliers.view',
    CREATE: 'suppliers.create',
    EDIT: 'suppliers.edit',
    DELETE: 'suppliers.delete',
  },
  PURCHASING: {
    VIEW: 'purchasing.view',
    CREATE: 'purchasing.create',
    APPROVE: 'purchasing.approve',
    RECEIVE: 'purchasing.receive',
    MANAGE: 'purchasing.manage',
    MANAGE_SUPPLIERS: 'purchasing.manage_suppliers',
  },
  SALES: {
    VIEW: 'sales.view',
    CREATE: 'sales.create',
    EDIT: 'sales.edit',
    MANAGE: 'sales.manage',
    CANCEL: 'sales.cancel',
    REFUND: 'sales.refund',
    VIEW_COST: 'sales.view_cost',
    APPLY_DISCOUNT: 'sales.apply_discount',
  },
  POS: {
    ACCESS: 'pos.access',
    OPEN_SESSION: 'pos.open_session',
    CLOSE_SESSION: 'pos.close_session',
    MANAGE_FLOAT: 'pos.manage_float',
  },
  CUSTOMERS: {
    VIEW: 'customers.view',
    CREATE: 'customers.create',
    EDIT: 'customers.edit',
    DELETE: 'customers.delete',
    EXPORT: 'customers.export',
  },
  FINANCE: {
    VIEW: 'finance.view',
    MANAGE: 'finance.manage',
    BANK_ACCOUNTS: 'finance.bank_accounts',
    EXPENSES: {
      VIEW: 'finance.expenses.view',
      CREATE: 'finance.expenses.create',
      APPROVE: 'finance.expenses.approve',
    },
    // Legacy keys kept for backward-compat
    MANAGE_ACCOUNTS: 'finance.manage_accounts',
    VIEW_REPORTS: 'finance.view_reports',
    MANAGE_EXPENSES: 'finance.manage_expenses',
    APPROVE_EXPENSES: 'finance.approve_expenses',
    MANAGE_PAYROLL: 'finance.manage_payroll',
  },
  STAFF: {
    VIEW: 'staff.view',
    MANAGE: 'staff.manage',
    // Legacy
    CREATE: 'staff.create',
    EDIT: 'staff.edit',
    MANAGE_ATTENDANCE: 'staff.manage_attendance',
    VIEW_SALARIES: 'staff.view_salaries',
  },
  TASKS: {
    VIEW: 'tasks.view',
    CREATE: 'tasks.create',
    MANAGE: 'tasks.manage',
    // Legacy
    EDIT: 'tasks.edit',
    ASSIGN: 'tasks.assign',
    DELETE: 'tasks.delete',
  },
  GOALS: {
    VIEW: 'goals.view',
    CREATE: 'goals.create',
    MANAGE: 'goals.manage',
    // Legacy
    EDIT: 'goals.edit',
    DELETE: 'goals.delete',
  },
  REPORTS: {
    VIEW: 'reports.view',
    EXPORT: 'reports.export',
    FINANCE: 'reports.finance',
    INVENTORY: 'reports.inventory',
    SALES: 'reports.sales',
    STAFF: 'reports.staff',
  },
  AI: {
    ACCESS: 'ai.access',
    CHAT: 'ai.chat',
    PROVIDERS: 'ai.providers',
    MEMORY: 'ai.memory',
    KNOWLEDGE: 'ai.knowledge',
    USAGE: 'ai.usage',
    TOOLS: 'ai.tools',
    APPROVALS: 'ai.approvals',
    AGENTS: 'ai.agents',
    // Legacy
    MANAGE_PROVIDERS: 'ai.manage_providers',
    VIEW_USAGE: 'ai.view_usage',
    MANAGE_BUDGET: 'ai.manage_budget',
  },
  SETTINGS: {
    VIEW: 'settings.view',
    EDIT: 'settings.edit',
    MANAGE_INTEGRATIONS: 'settings.manage_integrations',
    MANAGE: 'settings.manage',
  },
  ECOMMERCE: {
    MANAGE: 'ecommerce.manage',
  },
  INTEGRATIONS: {
    MANAGE: 'integrations.manage',
  },
  COMMUNICATIONS: {
    EMAIL_PROVIDERS: 'communications.email_providers',
    CAMPAIGNS: 'communications.campaigns',
    TEMPLATES: 'communications.templates',
    TELEGRAM: 'communications.telegram',
    WEBHOOKS: 'communications.webhooks',
  },
  NOTIFICATIONS: {
    VIEW: 'notifications.view',
  },
  ADMIN: {
    MANAGE_USERS: 'admin.manage_users',
    MANAGE_ROLES: 'admin.manage_roles',
    MANAGE_FEATURE_FLAGS: 'admin.manage_feature_flags',
    VIEW_AUDIT: 'admin.view_audit',
    MANAGE_LOCATIONS: 'admin.manage_locations',
    MANAGE_DEPARTMENTS: 'admin.manage_departments',
  },
} as const;

type PermissionsType = typeof PERMISSIONS;

type PermissionLeaves<T> = T extends string
  ? T
  : { [K in keyof T]: PermissionLeaves<T[K]> }[keyof T];

export type Permission = PermissionLeaves<PermissionsType>;

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS).flatMap(
  (group) => Object.values(group) as Permission[],
);
