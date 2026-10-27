export const SHOPIFY_API_VERSION = '2026-10';
export const SHOPIFY_SYNC_ENABLED_FLAG = 'SHOPIFY_SYNC_ENABLED';

export const SHOPIFY_CONNECTION_STATUS = {
  NOT_CONFIGURED: 'not_configured',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DEGRADED: 'degraded',
  REAUTH_REQUIRED: 'reauth_required',
  PERMISSION_REQUIRED: 'permission_required',
  DISCONNECTED: 'disconnected',
} as const;

export const SHOPIFY_WEBHOOK_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
  'inventory_levels/update',
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'refunds/create',
  'app/uninstalled',
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];
