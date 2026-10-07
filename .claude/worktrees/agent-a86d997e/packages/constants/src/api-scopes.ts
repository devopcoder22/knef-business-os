export const API_SCOPES = {
  PRODUCTS: {
    READ: 'products:read',
    WRITE: 'products:write',
  },
  INVENTORY: {
    READ: 'inventory:read',
    WRITE: 'inventory:write',
  },
  SALES: {
    READ: 'sales:read',
    WRITE: 'sales:write',
  },
  CUSTOMERS: {
    READ: 'customers:read',
    WRITE: 'customers:write',
  },
  SUPPLIERS: {
    READ: 'suppliers:read',
    WRITE: 'suppliers:write',
  },
  PURCHASING: {
    READ: 'purchasing:read',
    CREATE: 'purchasing:create',
    APPROVE: 'purchasing:approve',
  },
  FINANCE: {
    READ: 'finance:read',
    WRITE: 'finance:write',
    APPROVE: 'finance:approve',
  },
  STAFF: {
    READ: 'staff:read',
    WRITE: 'staff:write',
  },
  REPORTS: {
    READ: 'reports:read',
  },
  AI: {
    READ: 'ai:read',
    EXECUTE: 'ai:execute',
  },
  EMAIL: {
    SEND: 'email:send',
  },
  TELEGRAM: {
    SEND: 'telegram:send',
  },
  CALENDAR: {
    READ: 'calendar:read',
    WRITE: 'calendar:write',
  },
  TASKS: {
    READ: 'tasks:read',
    WRITE: 'tasks:write',
  },
  GOALS: {
    READ: 'goals:read',
  },
  NOTIFICATIONS: {
    WRITE: 'notifications:write',
  },
  AGENTS: {
    READ: 'agents:read',
    WRITE: 'agents:write',
  },
} as const;

type ApiScopesType = typeof API_SCOPES;

type ApiScopeLeaves<T> = T extends string
  ? T
  : { [K in keyof T]: ApiScopeLeaves<T[K]> }[keyof T];

export type ApiScope = ApiScopeLeaves<ApiScopesType>;

export const ALL_API_SCOPES: string[] = Object.values(API_SCOPES).flatMap(
  (group) => Object.values(group) as string[],
);
