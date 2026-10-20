import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditService } from '../audit/audit.service';
import { ExternalProviderFactory } from './providers/external-provider.factory';
import { encrypt, decrypt, generateSecureToken } from '@knef/utils';
import type { InitiateOAuthDto } from './dto/external-connection.dto';

const OAUTH_STATE_TTL = 600;
const stateKey = (token: string) => `integrations:oauth:state:${token}`;

interface StoredOAuthState {
  userId: string;
  organizationId: string;
  provider: string;
  shopDomain?: string;
}

@Injectable()
export class ExternalConnectionsService {
  private readonly logger = new Logger(ExternalConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly providerFactory: ExternalProviderFactory,
    private readonly configService: ConfigService,
  ) {}

  // ── OAuth initiation ───────────────────────────────────────────────────────

  async initiateOAuth(
    userId: string,
    organizationId: string,
    dto: InitiateOAuthDto,
  ): Promise<{ url: string; state: string }> {
    const { provider, additionalScopes = [], shopDomain } = dto;

    const state = generateSecureToken(24);
    await this.redis.setJson<StoredOAuthState>(
      stateKey(state),
      { userId, organizationId, provider, shopDomain },
      OAUTH_STATE_TTL,
    );

    const providerImpl = this.providerFactory.getProvider(provider);
    const scopesArg =
      provider === 'shopify' && shopDomain
        ? [shopDomain, ...additionalScopes]
        : additionalScopes;

    const url = providerImpl.getAuthorizationUrl(state, scopesArg);
    return { url, state };
  }

  // ── OAuth callback ─────────────────────────────────────────────────────────

  async handleOAuthCallback(
    code: string,
    state: string,
  ): Promise<{ connectionId: string; organizationId: string; provider: string }> {
    const stateData = await this.redis.getJson<StoredOAuthState>(stateKey(state));
    if (!stateData) {
      throw new UnauthorizedException(
        'Invalid or expired OAuth state. Please restart the connection flow.',
      );
    }

    await this.redis.del(stateKey(state));

    const { userId, organizationId, provider, shopDomain } = stateData;
    const providerImpl = this.providerFactory.getProvider(provider);

    let tokens: Awaited<ReturnType<typeof providerImpl.exchangeCode>>;
    try {
      tokens = await providerImpl.exchangeCode(code, shopDomain);
    } catch (err) {
      this.logger.error(`OAuth code exchange failed for ${provider}`, err);
      throw new BadRequestException(
        'Failed to connect. The authorization code may have expired.',
      );
    }

    let accountInfo: Awaited<ReturnType<typeof providerImpl.getAccountInfo>> | undefined;
    try {
      accountInfo = await providerImpl.getAccountInfo(tokens.accessToken, shopDomain);
    } catch (err) {
      this.logger.warn(`Could not fetch account info for ${provider}: ${err}`);
    }

    const encKey = this.encryptionKey;
    const now = new Date();
    const tokenExpiresAt = tokens.expiresInSeconds
      ? new Date(Date.now() + tokens.expiresInSeconds * 1000)
      : null;

    const existing = accountInfo?.id
      ? await this.prisma.externalConnection.findFirst({
          where: { organizationId, provider, externalAccountId: accountInfo.id },
        })
      : null;

    const metaJson = accountInfo?.metadata
      ? (accountInfo.metadata as Prisma.InputJsonValue)
      : undefined;

    const connection = existing
      ? await this.prisma.externalConnection.update({
          where: { id: existing.id },
          data: {
            accessTokenEncrypted: encrypt(tokens.accessToken, encKey),
            refreshTokenEncrypted: tokens.refreshToken
              ? encrypt(tokens.refreshToken, encKey)
              : existing.refreshTokenEncrypted,
            tokenExpiresAt,
            tokenRefreshedAt: now,
            tokenStatus: 'active',
            scopes: tokens.scopes ?? [],
            status: 'active',
            externalAccountName: accountInfo?.name ?? existing.externalAccountName,
            externalAccountEmail: accountInfo?.email ?? existing.externalAccountEmail,
            externalPageId: accountInfo?.pageId ?? existing.externalPageId,
            externalPageName: accountInfo?.pageName ?? existing.externalPageName,
            connectedByUserId: userId,
            connectedAt: now,
            disconnectedAt: null,
            metadata: (metaJson ?? existing.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        })
      : await this.prisma.externalConnection.create({
          data: {
            id: createId(),
            organizationId,
            provider,
            displayName: accountInfo?.name ?? provider,
            accessTokenEncrypted: encrypt(tokens.accessToken, encKey),
            refreshTokenEncrypted: tokens.refreshToken
              ? encrypt(tokens.refreshToken, encKey)
              : null,
            tokenExpiresAt,
            tokenRefreshedAt: now,
            tokenStatus: 'active',
            scopes: tokens.scopes ?? [],
            status: 'active',
            externalAccountId: accountInfo?.id ?? null,
            externalAccountName: accountInfo?.name ?? null,
            externalAccountEmail: accountInfo?.email ?? null,
            externalPageId: accountInfo?.pageId ?? null,
            externalPageName: accountInfo?.pageName ?? null,
            connectedByUserId: userId,
            connectedAt: now,
            metadata: metaJson,
          },
        });

    await this.audit.log({
      organizationId,
      userId,
      action: 'INTEGRATION_CONNECTED',
      entity: 'ExternalConnection',
      entityId: connection.id,
      metadata: { provider, accountId: accountInfo?.id, accountName: accountInfo?.name },
    });

    return { connectionId: connection.id, organizationId, provider };
  }

  // ── List connections ───────────────────────────────────────────────────────

  async listConnections(organizationId: string) {
    return this.prisma.externalConnection.findMany({
      where: { organizationId },
      select: {
        id: true,
        provider: true,
        displayName: true,
        status: true,
        externalAccountId: true,
        externalAccountName: true,
        externalAccountEmail: true,
        externalPageId: true,
        externalPageName: true,
        tokenStatus: true,
        tokenExpiresAt: true,
        tokenRefreshedAt: true,
        scopes: true,
        healthStatus: true,
        lastHealthCheckAt: true,
        errorCount: true,
        lastErrorAt: true,
        lastErrorMessage: true,
        connectedAt: true,
        disconnectedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get single connection ──────────────────────────────────────────────────

  async getConnection(organizationId: string, id: string) {
    const conn = await this.prisma.externalConnection.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        provider: true,
        displayName: true,
        status: true,
        externalAccountId: true,
        externalAccountName: true,
        externalAccountEmail: true,
        scopes: true,
        healthStatus: true,
        errorCount: true,
        connectedAt: true,
        createdAt: true,
      },
    });
    if (!conn) throw new NotFoundException('Integration connection not found');
    return conn;
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────

  async disconnect(
    organizationId: string,
    userId: string,
    id: string,
    revokeAtProvider = false,
  ) {
    const conn = await this.prisma.externalConnection.findFirst({
      where: { id, organizationId },
    });
    if (!conn) throw new NotFoundException('Integration connection not found');

    if (revokeAtProvider && conn.accessTokenEncrypted) {
      try {
        const providerImpl = this.providerFactory.getProvider(conn.provider);
        const token = decrypt(conn.accessTokenEncrypted, this.encryptionKey);
        await providerImpl.revokeToken(token);
      } catch (err) {
        this.logger.warn(`Token revocation failed for ${conn.provider} (${id}): ${err}`);
      }
    }

    await this.prisma.externalConnection.update({
      where: { id },
      data: {
        status: 'disconnected',
        tokenStatus: 'revoked',
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        disconnectedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'INTEGRATION_DISCONNECTED',
      entity: 'ExternalConnection',
      entityId: id,
      metadata: { provider: conn.provider, revokeAtProvider },
    });

    return { message: 'Integration disconnected successfully' };
  }

  // ── Health check ───────────────────────────────────────────────────────────

  async runHealthCheck(
    connectionId: string,
  ): Promise<{ healthy: boolean; message: string }> {
    const conn = await this.prisma.externalConnection.findFirst({
      where: { id: connectionId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (!conn.accessTokenEncrypted) {
      return { healthy: false, message: 'No credentials stored' };
    }

    try {
      const providerImpl = this.providerFactory.getProvider(conn.provider);
      const token = decrypt(conn.accessTokenEncrypted, this.encryptionKey);
      const shopDomain = (conn.metadata as Record<string, unknown> | null)?.['domain'] as
        | string
        | undefined;
      await providerImpl.getAccountInfo(token, shopDomain);

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

      return { healthy: true, message: 'Connection is healthy' };
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
      return { healthy: false, message: msg };
    }
  }

  // ── Token refresh (called by worker) ──────────────────────────────────────

  async refreshConnectionTokens(connectionId: string): Promise<void> {
    const conn = await this.prisma.externalConnection.findFirst({
      where: { id: connectionId, status: 'active' },
    });
    if (!conn?.refreshTokenEncrypted) return;

    const providerImpl = this.providerFactory.getProvider(conn.provider);
    if (!providerImpl.capabilities.supportsRefreshToken) return;

    const encKey = this.encryptionKey;
    const refreshToken = decrypt(conn.refreshTokenEncrypted, encKey);

    try {
      const newTokens = await providerImpl.refreshTokens(refreshToken);
      const tokenExpiresAt = newTokens.expiresInSeconds
        ? new Date(Date.now() + newTokens.expiresInSeconds * 1000)
        : null;

      await this.prisma.externalConnection.update({
        where: { id: connectionId },
        data: {
          accessTokenEncrypted: encrypt(newTokens.accessToken, encKey),
          refreshTokenEncrypted: newTokens.refreshToken
            ? encrypt(newTokens.refreshToken, encKey)
            : conn.refreshTokenEncrypted,
          tokenExpiresAt,
          tokenRefreshedAt: new Date(),
          tokenStatus: 'active',
        },
      });
    } catch (err) {
      this.logger.error(`Token refresh failed for connection ${connectionId}: ${err}`);
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

  // ── List supported providers ───────────────────────────────────────────────

  listProviders() {
    return this.providerFactory.listProviders().map((name) => {
      const p = this.providerFactory.getProvider(name);
      return { name, capabilities: p.capabilities };
    });
  }

  // ── Decrypt token for social publishing ───────────────────────────────────

  async decryptConnectionToken(connectionId: string): Promise<string> {
    const conn = await this.prisma.externalConnection.findUnique({
      where: { id: connectionId },
    });
    if (!conn?.accessTokenEncrypted) {
      throw new Error('No access token stored for connection');
    }
    return decrypt(conn.accessTokenEncrypted, this.encryptionKey);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private get encryptionKey(): string {
    return this.configService.getOrThrow<string>('ENCRYPTION_KEY');
  }
}
