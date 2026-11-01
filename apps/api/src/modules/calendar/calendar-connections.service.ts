import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../communications/notifications.service';
import { CalendarProviderFactory, CalendarProviderName } from './providers/calendar-provider.factory';
import { encrypt, decrypt, generateSecureToken } from '@knef/utils';
import type { OAuthTokens } from './providers/calendar-provider.interface';

const OAUTH_STATE_TTL = 600; // 10 minutes
const stateKey = (token: string) => `calendar:oauth:state:${token}`;

interface StoredOAuthState {
  userId: string;
  organizationId: string;
  provider: CalendarProviderName;
}

@Injectable()
export class CalendarConnectionsService {
  private readonly logger = new Logger(CalendarConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly providerFactory: CalendarProviderFactory,
    private readonly configService: ConfigService,
  ) {}

  // ── OAuth initiation ───────────────────────────────────────────────────────

  async getAuthorizationUrl(userId: string, organizationId: string, provider: CalendarProviderName): Promise<{ url: string; state: string }> {
    if (!this.providerFactory.isSupported(provider)) {
      throw new BadRequestException(`Unsupported calendar provider: ${provider}`);
    }

    const state = generateSecureToken(24);
    const stateData: StoredOAuthState = { userId, organizationId, provider };
    await this.redis.setJson(stateKey(state), stateData, OAUTH_STATE_TTL);

    const calendarProvider = this.providerFactory.getProvider(provider);
    const url = calendarProvider.getAuthorizationUrl(state);

    return { url, state };
  }

  // ── OAuth callback ─────────────────────────────────────────────────────────

  async handleCallback(code: string, state: string): Promise<{ connectionId: string; organizationId: string }> {
    const stateData = await this.redis.getJson<StoredOAuthState>(stateKey(state));
    if (!stateData) {
      throw new UnauthorizedException('Invalid or expired OAuth state. Please start the connection flow again.');
    }

    // Consume state token — single use
    await this.redis.del(stateKey(state));

    const { userId, organizationId, provider } = stateData;
    const calendarProvider = this.providerFactory.getProvider(provider);

    let tokens: OAuthTokens;
    try {
      tokens = await calendarProvider.exchangeCode(code);
    } catch (err) {
      this.logger.error(`OAuth code exchange failed for ${provider}`, err);
      throw new BadRequestException('Failed to connect calendar. The authorization code may have expired.');
    }

    // Try to get primary calendar info
    let calendarId: string | undefined;
    let calendarName: string | undefined;
    try {
      const calendars = await calendarProvider.listCalendars(tokens);
      const primary = calendars.find((c) => c.isPrimary) ?? calendars[0];
      calendarId = primary?.id;
      calendarName = primary?.name;
    } catch {
      this.logger.warn(`Could not fetch primary calendar info for ${provider}`);
    }

    const encKey = this.encryptionKey;
    const existing = await this.prisma.calendarIntegration.findFirst({
      where: { organizationId, userId, provider },
    });

    const connection = existing
      ? await this.prisma.calendarIntegration.update({
          where: { id: existing.id },
          data: {
            accessTokenEncrypted: encrypt(tokens.accessToken, encKey),
            refreshTokenEncrypted: tokens.refreshToken ? encrypt(tokens.refreshToken, encKey) : existing.refreshTokenEncrypted,
            expiresAt: tokens.expiresAt ?? null,
            scope: tokens.scope ?? null,
            calendarId: calendarId ?? existing.calendarId,
            calendarName: calendarName ?? existing.calendarName,
            isActive: true,
            syncToken: null,
          },
        })
      : await this.prisma.calendarIntegration.create({
          data: {
            id: createId(),
            organizationId,
            userId,
            provider,
            accessTokenEncrypted: encrypt(tokens.accessToken, encKey),
            refreshTokenEncrypted: tokens.refreshToken ? encrypt(tokens.refreshToken, encKey) : null,
            expiresAt: tokens.expiresAt ?? null,
            scope: tokens.scope ?? null,
            calendarId: calendarId ?? null,
            calendarName: calendarName ?? null,
            isActive: true,
            syncEnabled: true,
          },
        });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CALENDAR_CONNECTED',
      entity: 'CalendarIntegration',
      entityId: connection.id,
      metadata: { provider, calendarId, calendarName },
    });

    return { connectionId: connection.id, organizationId };
  }

  // ── List connections ───────────────────────────────────────────────────────

  async listConnections(organizationId: string, userId: string) {
    const connections = await this.prisma.calendarIntegration.findMany({
      where: { organizationId, userId },
      select: {
        id: true,
        provider: true,
        calendarId: true,
        calendarName: true,
        isActive: true,
        syncEnabled: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        scope: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return connections;
  }

  // ── Get single connection ──────────────────────────────────────────────────

  async getConnection(organizationId: string, userId: string, id: string) {
    const conn = await this.prisma.calendarIntegration.findFirst({
      where: { id, organizationId, userId },
      select: {
        id: true,
        provider: true,
        calendarId: true,
        calendarName: true,
        isActive: true,
        syncEnabled: true,
        lastSyncAt: true,
        createdAt: true,
        expiresAt: true,
        scope: true,
      },
    });
    if (!conn) throw new NotFoundException('Calendar connection not found');
    return conn;
  }

  // ── List provider calendars ────────────────────────────────────────────────

  async listCalendars(organizationId: string, userId: string, connectionId: string) {
    const { connection, tokens, provider } = await this.getConnectionWithTokens(organizationId, userId, connectionId);
    try {
      return await provider.listCalendars(tokens);
    } catch (err) {
      await this.handleProviderError(err, connection.id, connection.organizationId, connection.userId);
      throw err;
    }
  }

  // ── Set default calendar ───────────────────────────────────────────────────

  async setDefaultCalendar(organizationId: string, userId: string, connectionId: string, calendarId: string, calendarName?: string) {
    const conn = await this.prisma.calendarIntegration.findFirst({
      where: { id: connectionId, organizationId, userId },
    });
    if (!conn) throw new NotFoundException('Calendar connection not found');

    return this.prisma.calendarIntegration.update({
      where: { id: connectionId },
      data: { calendarId, calendarName: calendarName ?? null },
    });
  }

  // ── Test connection ────────────────────────────────────────────────────────

  async testConnection(organizationId: string, userId: string, connectionId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const { tokens, provider } = await this.getConnectionWithTokens(organizationId, userId, connectionId);
      const ok = await provider.testConnection(tokens);
      return { ok, message: ok ? 'Connection is healthy' : 'Connection test failed' };
    } catch {
      return { ok: false, message: 'Connection test failed. Credentials may have expired.' };
    }
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────

  async disconnect(organizationId: string, userId: string, connectionId: string) {
    const conn = await this.prisma.calendarIntegration.findFirst({
      where: { id: connectionId, organizationId, userId },
    });
    if (!conn) throw new NotFoundException('Calendar connection not found');

    await this.prisma.calendarIntegration.update({
      where: { id: connectionId },
      data: { isActive: false, accessTokenEncrypted: null, refreshTokenEncrypted: null, syncToken: null },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CALENDAR_DISCONNECTED',
      entity: 'CalendarIntegration',
      entityId: connectionId,
      metadata: { provider: conn.provider },
    });

    return { message: 'Calendar disconnected successfully' };
  }

  // ── Token refresh (internal) ───────────────────────────────────────────────

  async getValidTokens(connectionId: string): Promise<OAuthTokens & { connection: { id: string; organizationId: string; userId: string; provider: string; calendarId: string | null } }> {
    const conn = await this.prisma.calendarIntegration.findFirst({
      where: { id: connectionId, isActive: true },
    });
    if (!conn) throw new NotFoundException('Calendar connection not found or inactive');
    if (!conn.accessTokenEncrypted) throw new UnauthorizedException('Calendar credentials not available. Please reconnect.');

    const encKey = this.encryptionKey;
    let accessToken = decrypt(conn.accessTokenEncrypted, encKey);
    let expiresAt = conn.expiresAt ?? undefined;

    const isExpired = expiresAt && expiresAt < new Date(Date.now() + 60_000);
    if (isExpired) {
      if (!conn.refreshTokenEncrypted) {
        await this.markDisconnected(conn.id, conn.organizationId, conn.userId, 'no_refresh_token');
        throw new UnauthorizedException('Calendar session expired. Please reconnect.');
      }

      const refreshToken = decrypt(conn.refreshTokenEncrypted, encKey);
      const provider = this.providerFactory.getProvider(conn.provider as CalendarProviderName);

      try {
        const newTokens = await provider.refreshTokens(refreshToken);
        accessToken = newTokens.accessToken;
        expiresAt = newTokens.expiresAt;

        await this.prisma.calendarIntegration.update({
          where: { id: conn.id },
          data: {
            accessTokenEncrypted: encrypt(newTokens.accessToken, encKey),
            refreshTokenEncrypted: newTokens.refreshToken
              ? encrypt(newTokens.refreshToken, encKey)
              : conn.refreshTokenEncrypted,
            expiresAt: newTokens.expiresAt ?? null,
          },
        });
      } catch {
        await this.markDisconnected(conn.id, conn.organizationId, conn.userId, 'refresh_failed');
        throw new UnauthorizedException('Calendar credentials expired. Please reconnect your calendar.');
      }
    }

    return {
      accessToken,
      refreshToken: conn.refreshTokenEncrypted ? decrypt(conn.refreshTokenEncrypted, encKey) : undefined,
      expiresAt,
      connection: {
        id: conn.id,
        organizationId: conn.organizationId,
        userId: conn.userId,
        provider: conn.provider,
        calendarId: conn.calendarId,
      },
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getConnectionWithTokens(organizationId: string, userId: string, connectionId: string) {
    const conn = await this.prisma.calendarIntegration.findFirst({
      where: { id: connectionId, organizationId, userId },
    });
    if (!conn) throw new NotFoundException('Calendar connection not found');
    if (!conn.isActive) throw new BadRequestException('Calendar connection is inactive. Please reconnect.');

    const tokenData = await this.getValidTokens(connectionId);
    const provider = this.providerFactory.getProvider(conn.provider as CalendarProviderName);

    return { connection: conn, tokens: tokenData, provider };
  }

  private async handleProviderError(err: unknown, connectionId: string, organizationId: string, userId: string) {
    if (err instanceof UnauthorizedException) {
      await this.markDisconnected(connectionId, organizationId, userId, 'revoked');
      await this.notifications.createNotification({
        organizationId,
        userId,
        type: 'WARNING',
        title: 'Calendar disconnected',
        body: 'Your calendar connection has been revoked. Please reconnect in Calendar settings.',
        data: { connectionId },
      });
    }
  }

  private async markDisconnected(id: string, organizationId: string, userId: string, reason: string) {
    await this.prisma.calendarIntegration.update({
      where: { id },
      data: { isActive: false, accessTokenEncrypted: null, refreshTokenEncrypted: null },
    }).catch(() => {});

    this.audit.log({
      organizationId,
      userId,
      action: 'CALENDAR_AUTH_FAILED',
      entity: 'CalendarIntegration',
      entityId: id,
      metadata: { reason },
    }).catch(() => {});
  }

  private get encryptionKey(): string {
    return this.configService.getOrThrow<string>('ENCRYPTION_KEY');
  }
}
