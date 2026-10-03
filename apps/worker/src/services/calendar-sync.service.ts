import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import { decrypt, encrypt } from '@knef/utils';
import { PrismaService } from './prisma.service';
import type { WorkerConfig } from '../config/worker.config';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NormalizedEvent {
  externalEventId: string;
  externalCalendarId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  isAllDay: boolean;
  status: string;
  attendees?: unknown;
  recurrence?: unknown;
  reminders?: unknown;
  htmlLink?: string | null;
  cancelled: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseGoogleDate(d: { dateTime?: string; date?: string }): { date: Date; allDay: boolean } {
  if (d.dateTime) return { date: new Date(d.dateTime), allDay: false };
  // All-day: date string like "2026-10-03" — treat as UTC midnight
  return { date: new Date(`${d.date}T00:00:00.000Z`), allDay: true };
}

function parseMicrosoftDate(d: { dateTime: string; timeZone?: string }): Date {
  // Microsoft sends UTC or local time depending on the timezone field
  const dt = d.dateTime.endsWith('Z') ? d.dateTime : `${d.dateTime}Z`;
  return new Date(dt);
}

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  private get encKey(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  // ── Public entry point ────────────────────────────────────────────────────

  async syncIntegration(integrationId: string, organizationId: string): Promise<void> {
    const integration = await this.prisma.calendarIntegration.findFirst({
      where: { id: integrationId, organizationId, isActive: true, syncEnabled: true },
    });

    if (!integration) {
      this.logger.warn(`Integration ${integrationId} not found, inactive, or sync disabled — skipping`);
      return;
    }

    const accessToken = await this.getValidAccessToken(integration);

    if (integration.provider === 'google') {
      await this.syncGoogle(integration, accessToken);
    } else if (integration.provider === 'microsoft') {
      await this.syncMicrosoft(integration, accessToken);
    } else {
      this.logger.warn(`Unknown provider "${integration.provider}" — skipping`);
    }

    await this.prisma.calendarIntegration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });
  }

  // ── Token management ──────────────────────────────────────────────────────

  private async getValidAccessToken(
    integration: {
      id: string;
      provider: string;
      accessTokenEncrypted: string | null;
      refreshTokenEncrypted: string | null;
      expiresAt: Date | null;
    },
  ): Promise<string> {
    if (!integration.accessTokenEncrypted) {
      throw new UnrecoverableError(`Integration ${integration.id}: no access token stored`);
    }

    const now = new Date();
    const expiresAt = integration.expiresAt;
    const needsRefresh = !expiresAt || expiresAt.getTime() - now.getTime() < 60_000;

    if (!needsRefresh) {
      return decrypt(integration.accessTokenEncrypted, this.encKey);
    }

    // Token expired — refresh
    if (!integration.refreshTokenEncrypted) {
      await this.deactivate(integration.id, 'no refresh token');
      throw new UnrecoverableError(`Integration ${integration.id}: no refresh token`);
    }

    const refreshToken = decrypt(integration.refreshTokenEncrypted, this.encKey);
    return this.refreshAccessToken(integration, refreshToken);
  }

  private async refreshAccessToken(
    integration: { id: string; provider: string },
    refreshToken: string,
  ): Promise<string> {
    let endpoint: string;
    let body: URLSearchParams;

    if (integration.provider === 'google') {
      const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
      if (!clientId || !clientSecret) {
        throw new UnrecoverableError('Google OAuth credentials not configured in worker');
      }
      endpoint = 'https://oauth2.googleapis.com/token';
      body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      });
    } else if (integration.provider === 'microsoft') {
      const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID');
      const clientSecret = this.config.get<string>('MICROSOFT_CLIENT_SECRET');
      const tenant = this.config.get<string>('MICROSOFT_TENANT_ID', 'common');
      if (!clientId || !clientSecret) {
        throw new UnrecoverableError('Microsoft OAuth credentials not configured in worker');
      }
      endpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
      body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
      });
    } else {
      throw new UnrecoverableError(`Unknown provider: ${integration.provider}`);
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      // Revoked credentials — deactivate and do not retry
      await this.deactivate(integration.id, `token refresh failed (HTTP ${res.status})`);
      throw new UnrecoverableError(`Integration ${integration.id}: authorization revoked`);
    }

    if (!res.ok) {
      throw new Error(`Token refresh failed: HTTP ${res.status}`);
    }

    const json = await res.json() as { access_token: string; expires_in?: number; refresh_token?: string };
    const newAccessToken = json.access_token;
    const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);

    const updates: Record<string, unknown> = {
      accessTokenEncrypted: encrypt(newAccessToken, this.encKey),
      expiresAt,
    };
    if (json.refresh_token) {
      updates.refreshTokenEncrypted = encrypt(json.refresh_token, this.encKey);
    }

    await this.prisma.calendarIntegration.update({
      where: { id: integration.id },
      data: updates,
    });

    this.logger.debug(`Integration ${integration.id}: access token refreshed`);
    return newAccessToken;
  }

  private async deactivate(integrationId: string, reason: string): Promise<void> {
    await this.prisma.calendarIntegration.update({
      where: { id: integrationId },
      data: { isActive: false, syncEnabled: false },
    });
    this.logger.warn(`Integration ${integrationId} deactivated: ${reason}`);
  }

  // ── Google Calendar sync ──────────────────────────────────────────────────

  private async syncGoogle(
    integration: {
      id: string;
      organizationId: string;
      userId: string;
      provider: string;
      calendarId: string | null;
      syncToken: string | null;
    },
    accessToken: string,
  ): Promise<void> {
    const calId = encodeURIComponent(integration.calendarId ?? 'primary');
    let pageToken: string | undefined;
    let newSyncToken: string | undefined;
    let params: Record<string, string>;

    // Use existing syncToken for incremental sync, fall back to 30-day window
    if (integration.syncToken) {
      params = { syncToken: integration.syncToken };
    } else {
      const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      params = { timeMin, timeMax, maxResults: '250', singleEvents: 'true' };
    }

    let pageCount = 0;
    do {
      const qs = new URLSearchParams({ ...params, ...(pageToken ? { pageToken } : {}) });
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${qs}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (res.status === 410) {
        // Sync token expired — fall back to full sync
        this.logger.warn(`Integration ${integration.id}: Google syncToken expired, resetting`);
        await this.prisma.calendarIntegration.update({
          where: { id: integration.id },
          data: { syncToken: null },
        });
        // Recurse once with no syncToken
        const fresh = { ...integration, syncToken: null as string | null };
        return this.syncGoogle(fresh, accessToken);
      }

      if (res.status === 401 || res.status === 403) {
        await this.deactivate(integration.id, `Google API auth failure (${res.status})`);
        throw new UnrecoverableError(`Integration ${integration.id}: Google auth revoked`);
      }

      if (!res.ok) throw new Error(`Google Calendar API: HTTP ${res.status}`);

      const page = await res.json() as {
        items?: GoogleCalendarEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      };

      const items = page.items ?? [];
      await this.upsertGoogleEvents(integration, items);

      pageToken = page.nextPageToken;
      newSyncToken = page.nextSyncToken;
      pageCount++;
    } while (pageToken && pageCount < 20);

    if (newSyncToken) {
      await this.prisma.calendarIntegration.update({
        where: { id: integration.id },
        data: { syncToken: newSyncToken },
      });
    }

    this.logger.log(`Integration ${integration.id}: Google sync complete (${pageCount} page(s))`);
  }

  private async upsertGoogleEvents(
    integration: { id: string; organizationId: string; userId: string; provider: string; calendarId: string | null },
    items: GoogleCalendarEvent[],
  ): Promise<void> {
    for (const item of items) {
      if (item.status === 'cancelled') {
        await this.prisma.calendarEvent.deleteMany({
          where: {
            integrationId: integration.id,
            externalEventId: item.id,
          },
        });
        continue;
      }

      if (!item.start) continue;

      const startParsed = parseGoogleDate(item.start);
      const endParsed = item.end ? parseGoogleDate(item.end) : startParsed;

      const normalized: NormalizedEvent = {
        externalEventId: item.id,
        externalCalendarId: integration.calendarId ?? 'primary',
        title: item.summary ?? '(no title)',
        description: item.description ?? null,
        location: item.location ?? null,
        startAt: startParsed.date,
        endAt: endParsed.date,
        timezone: item.start.timeZone ?? 'UTC',
        isAllDay: startParsed.allDay,
        status: item.status ?? 'confirmed',
        attendees: item.attendees ?? null,
        recurrence: item.recurrence ?? null,
        reminders: item.reminders ?? null,
        htmlLink: item.htmlLink ?? null,
        cancelled: false,
      };

      await this.upsertEvent(integration, normalized);
    }
  }

  // ── Microsoft Calendar sync ───────────────────────────────────────────────

  private async syncMicrosoft(
    integration: {
      id: string;
      organizationId: string;
      userId: string;
      provider: string;
      calendarId: string | null;
    },
    accessToken: string,
  ): Promise<void> {
    // Full time-range sync (no delta link implementation in V1.1).
    // Limitation: every sync fetches the full window — no incremental delta.
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const calPath = integration.calendarId
      ? `/me/calendars/${integration.calendarId}/calendarView`
      : '/me/calendarView';

    const qs = new URLSearchParams({
      startDateTime: start,
      endDateTime: end,
      $top: '100',
      $select: 'id,subject,body,start,end,location,attendees,isAllDay,isCancelled,recurrence,isOnlineMeeting,webLink',
    });

    let url: string | null = `https://graph.microsoft.com/v1.0${calPath}?${qs}`;
    let pageCount = 0;

    while (url && pageCount < 20) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });

      if (res.status === 401 || res.status === 403) {
        await this.deactivate(integration.id, `Microsoft Graph auth failure (${res.status})`);
        throw new UnrecoverableError(`Integration ${integration.id}: Microsoft auth revoked`);
      }

      if (!res.ok) throw new Error(`Microsoft Graph API: HTTP ${res.status}`);

      const page = await res.json() as {
        value?: MicrosoftCalendarEvent[];
        '@odata.nextLink'?: string;
      };

      const items = page.value ?? [];
      await this.upsertMicrosoftEvents(integration, items);

      url = page['@odata.nextLink'] ?? null;
      pageCount++;
    }

    this.logger.log(`Integration ${integration.id}: Microsoft sync complete (${pageCount} page(s))`);
  }

  private async upsertMicrosoftEvents(
    integration: { id: string; organizationId: string; userId: string; provider: string },
    items: MicrosoftCalendarEvent[],
  ): Promise<void> {
    for (const item of items) {
      if (item.isCancelled) {
        await this.prisma.calendarEvent.deleteMany({
          where: { integrationId: integration.id, externalEventId: item.id },
        });
        continue;
      }

      if (!item.start) continue;

      const startAt = parseMicrosoftDate(item.start);
      const endAt = item.end ? parseMicrosoftDate(item.end) : startAt;

      const normalized: NormalizedEvent = {
        externalEventId: item.id,
        externalCalendarId: 'primary',
        title: item.subject ?? '(no title)',
        description: item.body?.content ?? null,
        location: item.location?.displayName ?? null,
        startAt,
        endAt,
        timezone: item.start.timeZone ?? 'UTC',
        isAllDay: item.isAllDay ?? false,
        status: 'confirmed',
        attendees: item.attendees ?? null,
        recurrence: item.recurrence ?? null,
        reminders: null,
        htmlLink: item.webLink ?? null,
        cancelled: false,
      };

      await this.upsertEvent(integration, normalized);
    }
  }

  // ── Shared upsert ─────────────────────────────────────────────────────────

  private async upsertEvent(
    integration: { id: string; organizationId: string; userId: string; provider: string },
    ev: NormalizedEvent,
  ): Promise<void> {
    await this.prisma.calendarEvent.upsert({
      where: {
        integrationId_externalEventId: {
          integrationId: integration.id,
          externalEventId: ev.externalEventId,
        },
      },
      create: {
        organizationId: integration.organizationId,
        userId: integration.userId,
        integrationId: integration.id,
        externalEventId: ev.externalEventId,
        externalCalendarId: ev.externalCalendarId,
        provider: integration.provider,
        title: ev.title,
        description: ev.description,
        location: ev.location,
        startAt: ev.startAt,
        endAt: ev.endAt,
        timezone: ev.timezone,
        isAllDay: ev.isAllDay,
        status: ev.status,
        attendees: ev.attendees as never,
        recurrence: ev.recurrence as never,
        reminders: ev.reminders as never,
        htmlLink: ev.htmlLink,
        syncedAt: new Date(),
      },
      update: {
        title: ev.title,
        description: ev.description,
        location: ev.location,
        startAt: ev.startAt,
        endAt: ev.endAt,
        timezone: ev.timezone,
        isAllDay: ev.isAllDay,
        status: ev.status,
        attendees: ev.attendees as never,
        recurrence: ev.recurrence as never,
        reminders: ev.reminders as never,
        htmlLink: ev.htmlLink,
        syncedAt: new Date(),
      },
    });
  }
}

// ── Google API response types (minimal) ───────────────────────────────────────
interface GoogleCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: unknown[];
  recurrence?: string[];
  reminders?: unknown;
  htmlLink?: string;
}

// ── Microsoft Graph API response types (minimal) ──────────────────────────────
interface MicrosoftCalendarEvent {
  id: string;
  subject?: string;
  body?: { contentType?: string; content?: string };
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  location?: { displayName?: string };
  attendees?: unknown[];
  isAllDay?: boolean;
  isCancelled?: boolean;
  recurrence?: unknown;
  webLink?: string;
}
