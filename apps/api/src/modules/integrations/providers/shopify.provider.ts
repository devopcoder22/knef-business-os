import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { ExternalProviderInterface, OAuthTokens, ExternalAccountInfo, ProviderCapabilities } from './external-provider.interface';

export const SHOPIFY_API_VERSION = '2026-10';

const DEFAULT_SCOPES = [
  'read_products', 'write_products',
  'read_inventory', 'write_inventory',
  'read_locations',
  'read_orders', 'write_orders',
  'read_assigned_fulfillment_orders', 'write_assigned_fulfillment_orders',
  'read_merchant_managed_fulfillment_orders', 'write_merchant_managed_fulfillment_orders',
  'read_customers',
];

@Injectable()
export class ShopifyExternalProvider implements ExternalProviderInterface {
  readonly provider = 'shopify';
  private readonly logger = new Logger(ShopifyExternalProvider.name);

  readonly capabilities: ProviderCapabilities = {
    supportsOAuth: true,
    supportsApiKey: true,
    supportsRefreshToken: false, // Shopify uses permanent tokens
    supportsWebhook: true,
    supportsPublishing: false,
    supportsAds: false,
  };

  constructor(private readonly config: ConfigService) {}

  // shopDomain must be passed via additionalScopes[0] for Shopify (shop-specific redirect)
  getAuthorizationUrl(state: string, additionalScopes: string[] = []): string {
    const clientId = this.config.getOrThrow<string>('SHOPIFY_CLIENT_ID');
    const redirectUri = this.config.getOrThrow<string>('INTEGRATIONS_SHOPIFY_REDIRECT_URI');
    const shopDomain = additionalScopes[0] ?? '';
    const scopes = DEFAULT_SCOPES.join(',');

    const params = new URLSearchParams({
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state,
    });

    return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, shopDomain?: string): Promise<OAuthTokens> {
    if (!shopDomain) throw new Error('Shopify exchangeCode requires shopDomain as redirectUri param');

    const clientId = this.config.getOrThrow<string>('SHOPIFY_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('SHOPIFY_CLIENT_SECRET');

    const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Shopify token exchange failed: ${err}`);
      throw new Error(`Shopify token exchange failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data['access_token'] as string,
      scopes: (data['scope'] as string | undefined)?.split(','),
    };
  }

  async refreshTokens(_refreshToken: string): Promise<OAuthTokens> {
    // Shopify permanent tokens do not expire; no refresh needed
    throw new Error('Shopify uses permanent access tokens; token refresh is not required');
  }

  async getAccountInfo(accessToken: string, shopDomain?: string): Promise<ExternalAccountInfo> {
    if (!shopDomain) throw new Error('Shopify getAccountInfo requires shopDomain');
    const query = `{ shop { id name email myshopifyDomain ianaTimezone currencyCode } }`;
    const res = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`Shopify shop info failed: ${res.status}`);
    const data = await res.json() as { data?: { shop?: Record<string, unknown> } };
    const shop = data.data?.shop ?? {};
    return {
      id: String(shop['id']),
      name: shop['name'] as string,
      email: shop['email'] as string | undefined,
      metadata: {
        domain: shopDomain,
        myshopifyDomain: shop['myshopifyDomain'],
        ianaTimezone: shop['ianaTimezone'],
        currencyCode: shop['currencyCode'],
      },
    };
  }

  async revokeToken(_accessToken: string): Promise<void> {
    // Shopify tokens are revoked by uninstalling the app via the Admin UI
    this.logger.warn('Shopify token revocation requires app uninstall from Shopify admin');
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(payload).digest('base64');
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
