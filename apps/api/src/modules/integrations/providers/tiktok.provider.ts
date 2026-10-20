import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { ExternalProviderInterface, OAuthTokens, ExternalAccountInfo, ProviderCapabilities } from './external-provider.interface';

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const USERINFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

const DEFAULT_SCOPES = ['user.info.basic'];

@Injectable()
export class TikTokExternalProvider implements ExternalProviderInterface {
  readonly provider = 'tiktok';
  private readonly logger = new Logger(TikTokExternalProvider.name);

  readonly capabilities: ProviderCapabilities = {
    supportsOAuth: true,
    supportsApiKey: false,
    supportsRefreshToken: true,
    supportsWebhook: false,
    supportsPublishing: true,
    supportsAds: true,
  };

  constructor(private readonly config: ConfigService) {}

  getAuthorizationUrl(state: string, additionalScopes: string[] = []): string {
    const clientKey = this.config.getOrThrow<string>('TIKTOK_CLIENT_KEY');
    const redirectUri = this.config.getOrThrow<string>('INTEGRATIONS_TIKTOK_REDIRECT_URI');
    const scopes = [...DEFAULT_SCOPES, ...additionalScopes];

    const params = new URLSearchParams({
      client_key: clientKey,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(','),
      state,
    });

    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const clientKey = this.config.getOrThrow<string>('TIKTOK_CLIENT_KEY');
    const clientSecret = this.config.getOrThrow<string>('TIKTOK_CLIENT_SECRET');
    const redirectUri = this.config.getOrThrow<string>('INTEGRATIONS_TIKTOK_REDIRECT_URI');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`TikTok token exchange failed: ${err}`);
      throw new Error(`TikTok token exchange failed: ${res.status}`);
    }

    const data = await res.json() as { data?: Record<string, unknown> };
    const payload = data.data ?? (data as unknown as Record<string, unknown>);
    return {
      accessToken: payload['access_token'] as string,
      refreshToken: payload['refresh_token'] as string | undefined,
      expiresInSeconds: payload['expires_in'] as number | undefined,
      scopes: (payload['scope'] as string | undefined)?.split(','),
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const clientKey = this.config.getOrThrow<string>('TIKTOK_CLIENT_KEY');
    const clientSecret = this.config.getOrThrow<string>('TIKTOK_CLIENT_SECRET');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) throw new Error(`TikTok token refresh failed: ${res.status}`);

    const data = await res.json() as { data?: Record<string, unknown> };
    const payload = data.data ?? (data as unknown as Record<string, unknown>);
    return {
      accessToken: payload['access_token'] as string,
      refreshToken: payload['refresh_token'] as string | undefined,
      expiresInSeconds: payload['expires_in'] as number | undefined,
    };
  }

  async getAccountInfo(accessToken: string): Promise<ExternalAccountInfo> {
    const res = await fetch(`${USERINFO_URL}?fields=open_id,display_name,avatar_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`TikTok userinfo failed: ${res.status}`);

    const data = await res.json() as { data?: { user?: Record<string, unknown> } };
    const user = data.data?.user ?? {};
    return {
      id: user['open_id'] as string,
      name: user['display_name'] as string,
    };
  }

  async revokeToken(accessToken: string): Promise<void> {
    const clientKey = this.config.getOrThrow<string>('TIKTOK_CLIENT_KEY');
    const clientSecret = this.config.getOrThrow<string>('TIKTOK_CLIENT_SECRET');

    await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        token: accessToken,
      }).toString(),
    });
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
