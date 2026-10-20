import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { ExternalProviderInterface, OAuthTokens, ExternalAccountInfo, ProviderCapabilities } from './external-provider.interface';

const AUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const ME_URL = 'https://graph.facebook.com/v19.0/me';

const DEFAULT_SCOPES = [
  'email',
  'public_profile',
  'pages_show_list',
  'instagram_basic',
];

@Injectable()
export class MetaExternalProvider implements ExternalProviderInterface {
  readonly provider = 'meta';
  private readonly logger = new Logger(MetaExternalProvider.name);

  readonly capabilities: ProviderCapabilities = {
    supportsOAuth: true,
    supportsApiKey: false,
    supportsRefreshToken: false,  // Meta uses long-lived tokens instead
    supportsWebhook: true,
    supportsPublishing: true,
    supportsAds: true,
  };

  constructor(private readonly config: ConfigService) {}

  getAuthorizationUrl(state: string, additionalScopes: string[] = []): string {
    const appId = this.config.getOrThrow<string>('META_APP_ID');
    const redirectUri = this.config.getOrThrow<string>('INTEGRATIONS_META_REDIRECT_URI');
    const scopes = [...DEFAULT_SCOPES, ...additionalScopes];

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: scopes.join(','),
      state,
      response_type: 'code',
    });

    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const appId = this.config.getOrThrow<string>('META_APP_ID');
    const appSecret = this.config.getOrThrow<string>('META_APP_SECRET');
    const redirectUri = this.config.getOrThrow<string>('INTEGRATIONS_META_REDIRECT_URI');

    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const res = await fetch(`${TOKEN_URL}?${params.toString()}`);
    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Meta token exchange failed: ${err}`);
      throw new Error(`Meta token exchange failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data['access_token'] as string,
      expiresInSeconds: data['expires_in'] as number | undefined,
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    // Meta does not use standard refresh tokens; exchange for long-lived token instead
    const appId = this.config.getOrThrow<string>('META_APP_ID');
    const appSecret = this.config.getOrThrow<string>('META_APP_SECRET');

    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: refreshToken,
    });

    const res = await fetch(`${TOKEN_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`Meta token exchange failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data['access_token'] as string,
      expiresInSeconds: data['expires_in'] as number | undefined,
    };
  }

  async getAccountInfo(accessToken: string): Promise<ExternalAccountInfo> {
    const res = await fetch(`${ME_URL}?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) throw new Error(`Meta me endpoint failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return {
      id: data['id'] as string,
      name: data['name'] as string,
      email: data['email'] as string | undefined,
    };
  }

  async revokeToken(accessToken: string): Promise<void> {
    const appId = this.config.getOrThrow<string>('META_APP_ID');
    const appSecret = this.config.getOrThrow<string>('META_APP_SECRET');

    const data = await this.getAccountInfo(accessToken);
    await fetch(
      `https://graph.facebook.com/v19.0/${data.id}/permissions?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${appId}|${appSecret}` },
      },
    );
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
