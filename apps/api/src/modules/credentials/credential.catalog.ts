export interface CredentialSlot {
  key: string;
  label: string;
  group: string;
  groupLabel: string;
  description: string;
  sensitive: boolean;
}

export const CREDENTIAL_CATALOG: CredentialSlot[] = [
  // ── Meta / Facebook / Instagram ───────────────────────────────────────────
  {
    key: 'META_APP_ID',
    label: 'Meta App ID',
    group: 'meta',
    groupLabel: 'Meta (Facebook / Instagram)',
    description: 'Facebook App ID — used for OAuth and advertising integrations',
    sensitive: false,
  },
  {
    key: 'META_APP_SECRET',
    label: 'Meta App Secret',
    group: 'meta',
    groupLabel: 'Meta (Facebook / Instagram)',
    description: 'Facebook App Secret — used to sign tokens and verify webhooks',
    sensitive: true,
  },
  {
    key: 'META_WEBHOOK_VERIFY_TOKEN',
    label: 'Meta Webhook Verify Token',
    group: 'meta',
    groupLabel: 'Meta (Facebook / Instagram)',
    description: 'Your custom token Meta sends back during webhook subscription verification',
    sensitive: true,
  },

  // ── TikTok ────────────────────────────────────────────────────────────────
  {
    key: 'TIKTOK_CLIENT_KEY',
    label: 'TikTok Client Key',
    group: 'tiktok',
    groupLabel: 'TikTok for Business',
    description: 'TikTok App client key (equivalent to client ID)',
    sensitive: false,
  },
  {
    key: 'TIKTOK_CLIENT_SECRET',
    label: 'TikTok Client Secret',
    group: 'tiktok',
    groupLabel: 'TikTok for Business',
    description: 'TikTok App client secret — used for OAuth token exchange',
    sensitive: true,
  },

  // ── Shopify ───────────────────────────────────────────────────────────────
  {
    key: 'SHOPIFY_CLIENT_ID',
    label: 'Shopify Client ID',
    group: 'shopify',
    groupLabel: 'Shopify',
    description: 'Shopify Partner App client ID (API key)',
    sensitive: false,
  },
  {
    key: 'SHOPIFY_CLIENT_SECRET',
    label: 'Shopify Client Secret',
    group: 'shopify',
    groupLabel: 'Shopify',
    description: 'Shopify Partner App client secret — used for OAuth and HMAC webhook verification',
    sensitive: true,
  },

  // ── Payments ──────────────────────────────────────────────────────────────
  {
    key: 'PAYSTACK_SECRET_KEY',
    label: 'Paystack Secret Key',
    group: 'paystack',
    groupLabel: 'Paystack',
    description: 'Paystack API secret key (sk_live_... or sk_test_...)',
    sensitive: true,
  },
  {
    key: 'PAYSTACK_WEBHOOK_SECRET',
    label: 'Paystack Webhook Secret',
    group: 'paystack',
    groupLabel: 'Paystack',
    description: 'HMAC secret for verifying Paystack webhook signatures',
    sensitive: true,
  },

  // ── Telegram ──────────────────────────────────────────────────────────────
  {
    key: 'TELEGRAM_BOT_TOKEN',
    label: 'Telegram Bot Token',
    group: 'telegram',
    groupLabel: 'Telegram',
    description: 'BotFather token — used to send task assignment notifications via Telegram',
    sensitive: true,
  },

  // ── Cloudflare Turnstile ──────────────────────────────────────────────────
  {
    key: 'CLOUDFLARE_TURNSTILE_SECRET',
    label: 'Cloudflare Turnstile Secret',
    group: 'cloudflare',
    groupLabel: 'Cloudflare',
    description: 'Server-side secret for Turnstile CAPTCHA verification on login / storefront',
    sensitive: true,
  },
];

export const CREDENTIAL_KEYS = new Set(CREDENTIAL_CATALOG.map((c) => c.key));
