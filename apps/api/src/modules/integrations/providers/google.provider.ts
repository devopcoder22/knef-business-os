import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { ExternalProviderInterface, OAuthTokens, ExternalAccountInfo, ProviderCapabilities } from './external-provider.interface';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const DEFAULT_SCOPES = [
  'openid',
  'email',
  'profile',
];

@Injectable()
export class GoogleExternalProvider implements ExternalProviderInterface {
  readonly provider = 'google';
  private readonly logger = new Logger(GoogleExternalProvider.name);

  readonly capabilities: ProviderCapabilities = {
    supportsOAuth: true,
    supportsApiKey: false,
    supportsRefreshToken: true,
    supportsWebhook: false,
    supportsPublishing: false,
    supportsAds: true,
  };

  constructor(private readonly config: ConfigService) {}

  getAuthorizationUrl(state: string, additionalScopes: string[] = []): string {
    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.config.getOrThrow<string>('INTEGRATIONS_GOOGLE_REDIRECT_URI');
    const scopes = [...DEFAULT_SCOPES, ...additionalScopes];

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent select_account',
    });

    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.getOrThrow<string>('INTEGRATIONS_GOOGLE_REDIRECT_URI');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Google token exchange failed: ${err}`);
      throw new Error(`Google token exchange failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data['access_token'] as string,
      refreshToken: data['refresh_token'] as string | undefined,
      expiresInSeconds: data['expires_in'] as number | undefined,
      scopes: (data['scope'] as string | undefined)?.split(' '),
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Google token refresh failed: ${err}`);
      throw new Error(`Google token refresh failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data['access_token'] as string,
      refreshToken: (data['refresh_token'] as string | undefined) ?? refreshToken,
      expiresInSeconds: data['expires_in'] as number | undefined,
    };
  }

  async getAccountInfo(accessToken: string): Promise<ExternalAccountInfo> {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return {
      id: data['id'] as string,
      name: data['name'] as string,
      email: data['email'] as string | undefined,
    };
  }

  async revokeToken(accessToken: string): Promise<void> {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(accessToken)}`, { method: 'POST' });
  }

  verifyWebhookSignature(_payload: string, _signature: string, _secret: string): boolean {
    return false; // Google Pub/Sub uses JWT verification, not HMAC
  }
}
