import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encrypt, decrypt } from '@knef/utils';
import { PrismaService } from './prisma.service';
import type { WorkerConfig } from '../config/worker.config';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

@Injectable()
export class IntegrationSyncService {
  private readonly logger = new Logger(IntegrationSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  // ── Token refresh ─────────────────────────────────────────────────────────

  async refreshConnectionTokens(connectionId: string): Promise<void> {
    const conn = await this.prisma.externalConnection.findFirst({
      where: { id: connectionId, status: 'active' },
    });
    if (!conn?.refreshTokenEncrypted) return;

    const encKey = this.encryptionKey;
    const refreshToken = decrypt(conn.refreshTokenEncrypted, encKey);

    try {
      const newTokens = await this.doRefresh(conn.provider, refreshToken);
      const tokenExpiresAt = newTokens.expires_in
        ? new Date(Date.now() + newTokens.expires_in * 1000)
        : null;

      await this.prisma.externalConnection.update({
        where: { id: connectionId },
        data: {
          accessTokenEncrypted: encrypt(newTokens.access_token, encKey),
          refreshTokenEncrypted: newTokens.refresh_token
            ? encrypt(newTokens.refresh_token, encKey)
            : conn.refreshTokenEncrypted,
          tokenExpiresAt,
          tokenRefreshedAt: new Date(),
          tokenStatus: 'active',
        },
      });

      this.logger.log(`Refreshed tokens for connection ${connectionId} (${conn.provider})`);
    } catch (err) {
      this.logger.error(`Token refresh failed for ${connectionId}: ${err}`);
      await this.prisma.externalConnection.update({
        where: { id: connectionId },
        data: {
          tokenStatus: 'expired',
          errorCount: { increment: 1 },
          lastErrorAt: new Date(),
          lastErrorMessage:
            err instanceof Error ? err.message.slice(0, 255) : 'Token refresh failed',
        },
      });
    }
  }

  // ── Health check ──────────────────────────────────────────────────────────

  async runHealthCheck(connectionId: string): Promise<void> {
    const conn = await this.prisma.externalConnection.findFirst({
      where: { id: connectionId },
    });
    if (!conn?.accessTokenEncrypted) return;

    const encKey = this.encryptionKey;
    const accessToken = decrypt(conn.accessTokenEncrypted, encKey);
    const shopDomain = (conn.metadata as Record<string, unknown> | null)?.['domain'] as
      | string
      | undefined;

    try {
      await this.doHealthCheck(conn.provider, accessToken, shopDomain);

      await this.prisma.externalConnection.update({
        where: { id: connectionId },
        data: {
          healthStatus: 'healthy',
          lastHealthCheckAt: new Date(),
          errorCount: 0,
          lastErrorAt: null,
          lastErrorMessage: null,
        },
      });

      this.logger.log(`Health check OK for connection ${connectionId} (${conn.provider})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.externalConnection.update({
        where: { id: connectionId },
        data: {
          healthStatus: 'unhealthy',
          lastHealthCheckAt: new Date(),
          errorCount: { increment: 1 },
          lastErrorAt: new Date(),
          lastErrorMessage: msg.slice(0, 255),
        },
      });

      this.logger.warn(`Health check FAILED for connection ${connectionId} (${conn.provider}): ${msg}`);
    }
  }

  // ── Provider-specific logic ───────────────────────────────────────────────

  private async doRefresh(provider: string, refreshToken: string): Promise<TokenResponse> {
    switch (provider) {
      case 'google':
        return this.refreshGoogle(refreshToken);
      case 'tiktok':
        return this.refreshTikTok(refreshToken);
      case 'meta':
        return this.refreshMeta(refreshToken);
      default:
        throw new Error(`Provider ${provider} does not support token refresh`);
    }
  }

  private async doHealthCheck(
    provider: string,
    accessToken: string,
    shopDomain?: string,
  ): Promise<void> {
    switch (provider) {
      case 'google':
        await this.checkGoogle(accessToken);
        break;
      case 'meta':
        await this.checkMeta(accessToken);
        break;
      case 'tiktok':
        await this.checkTikTok(accessToken);
        break;
      case 'shopify':
        if (!shopDomain) throw new Error('Shopify health check requires shopDomain');
        await this.checkShopify(accessToken, shopDomain);
        break;
      default:
        this.logger.warn(`No health check implementation for provider: ${provider}`);
    }
  }

  // ── Google ────────────────────────────────────────────────────────────────

  private async refreshGoogle(refreshToken: string): Promise<TokenResponse> {
    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET');

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
    return res.json() as Promise<TokenResponse>;
  }

  private async checkGoogle(accessToken: string): Promise<void> {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!res.ok) throw new Error(`Google token invalid: ${res.status}`);
  }

  // ── TikTok ────────────────────────────────────────────────────────────────

  private async refreshTikTok(refreshToken: string): Promise<TokenResponse> {
    const clientKey = process.env['TIKTOK_CLIENT_KEY'] ?? '';
    const clientSecret = process.env['TIKTOK_CLIENT_SECRET'] ?? '';

    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
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
    const data = (await res.json()) as { data?: TokenResponse };
    return (data.data ?? data) as TokenResponse;
  }

  private async checkTikTok(accessToken: string): Promise<void> {
    const res = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) throw new Error(`TikTok token invalid: ${res.status}`);
  }

  // ── Meta ──────────────────────────────────────────────────────────────────

  private async refreshMeta(fbExchangeToken: string): Promise<TokenResponse> {
    const appId = process.env['META_APP_ID'] ?? '';
    const appSecret = process.env['META_APP_SECRET'] ?? '';

    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: fbExchangeToken,
    });
    const res = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`,
    );
    if (!res.ok) throw new Error(`Meta token refresh failed: ${res.status}`);
    return res.json() as Promise<TokenResponse>;
  }

  private async checkMeta(accessToken: string): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!res.ok) throw new Error(`Meta token invalid: ${res.status}`);
  }

  // ── Shopify ───────────────────────────────────────────────────────────────

  private async checkShopify(accessToken: string, shopDomain: string): Promise<void> {
    const res = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    if (!res.ok) throw new Error(`Shopify health check failed: ${res.status}`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private get encryptionKey(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }
}
