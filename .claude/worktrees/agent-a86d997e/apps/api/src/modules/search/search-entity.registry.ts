import { PERMISSIONS } from '@knef/constants';

export const SEARCH_ENTITY_TYPES = [
  'PRODUCT',
  'CUSTOMER',
  'ORDER',
  'INVOICE',
  'STAFF',
  'SUPPLIER',
  'TRANSACTION',
  'SERIALIZED_UNIT',
  'TASK',
] as const;

export type SearchEntityType = typeof SEARCH_ENTITY_TYPES[number];

export interface SearchEntityConfig {
  type: SearchEntityType;
  permission: string;
  locationAware: boolean;
  sensitive: boolean;
  label: string;
}

export const SEARCH_ENTITY_REGISTRY: Record<SearchEntityType, SearchEntityConfig> = {
  PRODUCT:         { type: 'PRODUCT',         permission: PERMISSIONS.PRODUCTS.VIEW,   locationAware: false, sensitive: false, label: 'Products' },
  CUSTOMER:        { type: 'CUSTOMER',        permission: PERMISSIONS.CUSTOMERS.VIEW,  locationAware: false, sensitive: false, label: 'Customers' },
  ORDER:           { type: 'ORDER',           permission: PERMISSIONS.SALES.VIEW,      locationAware: true,  sensitive: false, label: 'Orders' },
  INVOICE:         { type: 'INVOICE',         permission: PERMISSIONS.SALES.VIEW,      locationAware: false, sensitive: true,  label: 'Invoices' },
  STAFF:           { type: 'STAFF',           permission: PERMISSIONS.STAFF.VIEW,      locationAware: true,  sensitive: true,  label: 'Staff' },
  SUPPLIER:        { type: 'SUPPLIER',        permission: PERMISSIONS.SUPPLIERS.VIEW,  locationAware: false, sensitive: false, label: 'Suppliers' },
  TRANSACTION:     { type: 'TRANSACTION',     permission: PERMISSIONS.FINANCE.VIEW,    locationAware: false, sensitive: true,  label: 'Transactions' },
  SERIALIZED_UNIT: { type: 'SERIALIZED_UNIT', permission: PERMISSIONS.INVENTORY.VIEW,  locationAware: true,  sensitive: false, label: 'Serialized Inventory' },
  TASK:            { type: 'TASK',            permission: PERMISSIONS.TASKS.VIEW,      locationAware: false, sensitive: false, label: 'Tasks' },
};

export function isSearchEntityType(value: string): value is SearchEntityType {
  return (SEARCH_ENTITY_TYPES as readonly string[]).includes(value);
}
