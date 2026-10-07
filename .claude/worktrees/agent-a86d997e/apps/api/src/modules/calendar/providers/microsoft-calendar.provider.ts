import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CalendarProvider,
  OAuthTokens,
  CalendarInfo,
  ProviderEvent,
  CreateEventInput,
  ListEventsParams,
  ListEventsResult,
  AvailabilityParams,
  TimeSlot,
} from './calendar-provider.interface';

const MS_TOKEN_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
const MS_AUTH_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
const MS_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const MS_SCOPES = [
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'offline_access',
  'openid',
  'profile',
].join(' ');

@Injectable()
export class MicrosoftCalendarProvider implements CalendarProvider {
  readonly providerName = 'microsoft';
  private readonly logger = new Logger(MicrosoftCalendarProvider.name);

  private get clientId(): string {
    return this.configService.getOrThrow<string>('MICROSOFT_CLIENT_ID');
  }

  private get clientSecret(): string {
    return this.configService.getOrThrow<string>('MICROSOFT_CLIENT_SECRET');
  }

  private get tenantId(): string {
    return this.configService.get<string>('MICROSOFT_TENANT_ID', 'common');
  }

  private get redirectUri(): string {
    return this.configService.getOrThrow<string>('MICROSOFT_CALENDAR_REDIRECT_URI');
  }

  constructor(private readonly configService: ConfigService) {}

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: MS_SCOPES,
      state,
      response_mode: 'query',
    });
    return `${MS_AUTH_URL(this.tenantId)}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const res = await fetch(MS_TOKEN_URL(this.tenantId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
        scope: MS_SCOPES,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Microsoft token exchange failed: ${err}`);
      throw new UnauthorizedException('Failed to exchange Microsoft OAuth code');
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch(MS_TOKEN_URL(this.tenantId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'refresh_token',
        scope: MS_SCOPES,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Microsoft token refresh failed: ${err}`);
      throw new UnauthorizedException('Microsoft Calendar token refresh failed. Please reconnect.');
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  }

  async testConnection(tokens: OAuthTokens): Promise<boolean> {
    try {
      const res = await this.get(tokens, '/me/calendars?$top=1');
      return res.ok;
    } catch {
      return false;
    }
  }

  async listCalendars(tokens: OAuthTokens): Promise<CalendarInfo[]> {
    const res = await this.get(tokens, '/me/calendars');
    await this.assertOk(res, 'list calendars');
    const data = (await res.json()) as {
      value: Array<{
        id: string;
        name: string;
        isDefaultCalendar?: boolean;
        canEdit?: boolean;
        color?: string;
      }>;
    };

    return (data.value ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      isPrimary: c.isDefaultCalendar ?? false,
      accessRole: c.canEdit ? 'writer' : 'reader',
      backgroundColor: c.color,
    }));
  }

  async listEvents(
    tokens: OAuthTokens,
    calendarId: string,
    params: ListEventsParams,
  ): Promise<ListEventsResult> {
    const filters: string[] = [];
    if (params.timeMin) filters.push(`start/dateTime ge '${params.timeMin.toISOString()}'`);
    if (params.timeMax) filters.push(`end/dateTime le '${params.timeMax.toISOString()}'`);

    const query = new URLSearchParams({
      $orderby: 'start/dateTime',
      $top: String(params.maxResults ?? 250),
    });
    if (filters.length > 0) query.set('$filter', filters.join(' and '));
    if (params.pageToken) query.set('$skiptoken', params.pageToken);

    const calPath = calendarId === 'primary' ? '/me/calendar' : `/me/calendars/${calendarId}`;
    const res = await this.get(tokens, `${calPath}/events?${query}`);
    await this.assertOk(res, 'list events');
    const data = (await res.json()) as {
      value: unknown[];
      '@odata.nextLink'?: string;
    };

    const nextLink = data['@odata.nextLink'];
    const nextPageToken = nextLink
      ? new URL(nextLink).searchParams.get('$skiptoken') ?? undefined
      : undefined;

    return {
      events: (data.value ?? []).map((e) => this.mapEvent(e as Record<string, unknown>, calendarId)),
      nextPageToken,
    };
  }

  async getEvent(tokens: OAuthTokens, calendarId: string, eventId: string): Promise<ProviderEvent> {
    const calPath = calendarId === 'primary' ? '/me/calendar' : `/me/calendars/${calendarId}`;
    const res = await this.get(tokens, `${calPath}/events/${eventId}`);
    await this.assertOk(res, 'get event');
    return this.mapEvent((await res.json()) as Record<string, unknown>, calendarId);
  }

  async createEvent(tokens: OAuthTokens, calendarId: string, event: CreateEventInput): Promise<ProviderEvent> {
    const calPath = calendarId === 'primary' ? '/me/calendar' : `/me/calendars/${calendarId}`;
    const body = this.buildEventBody(event);
    const res = await this.post(tokens, `${calPath}/events`, body);
    await this.assertOk(res, 'create event');
    return this.mapEvent((await res.json()) as Record<string, unknown>, calendarId);
  }

  async updateEvent(
    tokens: OAuthTokens,
    calendarId: string,
    eventId: string,
    event: Partial<CreateEventInput>,
  ): Promise<ProviderEvent> {
    const calPath = calendarId === 'primary' ? '/me/calendar' : `/me/calendars/${calendarId}`;
    const body = this.buildEventBody(event as CreateEventInput);
    const res = await this.patch(tokens, `${calPath}/events/${eventId}`, body);
    await this.assertOk(res, 'update event');
    return this.mapEvent((await res.json()) as Record<string, unknown>, calendarId);
  }

  async deleteEvent(tokens: OAuthTokens, calendarId: string, eventId: string): Promise<void> {
    const calPath = calendarId === 'primary' ? '/me/calendar' : `/me/calendars/${calendarId}`;
    const res = await this.request('DELETE', tokens, `${calPath}/events/${eventId}`);
    if (!res.ok && res.status !== 404) {
      await this.assertOk(res, 'delete event');
    }
  }

  async findAvailability(tokens: OAuthTokens, params: AvailabilityParams): Promise<TimeSlot[]> {
    const schedules = params.calendarIds?.length ? params.calendarIds : ['me'];
    const body = {
      schedules,
      startTime: { dateTime: params.timeMin.toISOString(), timeZone: params.timezone },
      endTime: { dateTime: params.timeMax.toISOString(), timeZone: params.timezone },
      availabilityViewInterval: 30,
    };

    const res = await this.post(tokens, '/me/calendar/getSchedule', body);
    await this.assertOk(res, 'find availability');
    const data = (await res.json()) as {
      value: Array<{
        scheduleItems: Array<{ start: { dateTime: string }; end: { dateTime: string }; status: string }>;
      }>;
    };

    const busySlots: TimeSlot[] = (data.value ?? []).flatMap((s) =>
      (s.scheduleItems ?? [])
        .filter((item) => item.status !== 'free')
        .map((item) => ({
          start: new Date(item.start.dateTime),
          end: new Date(item.end.dateTime),
        })),
    );

    return busySlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async get(tokens: OAuthTokens, path: string): Promise<Response> {
    return this.request('GET', tokens, path);
  }

  private async post(tokens: OAuthTokens, path: string, body: unknown): Promise<Response> {
    return this.request('POST', tokens, path, body);
  }

  private async patch(tokens: OAuthTokens, path: string, body: unknown): Promise<Response> {
    return this.request('PATCH', tokens, path, body);
  }

  private async request(method: string, tokens: OAuthTokens, path: string, body?: unknown): Promise<Response> {
    const url = path.startsWith('http') ? path : `${MS_GRAPH_BASE}${path}`;
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private async assertOk(res: Response, action: string): Promise<void> {
    if (!res.ok) {
      if (res.status === 401) {
        throw new UnauthorizedException('Microsoft Calendar access token expired or revoked');
      }
      const err = await res.text().catch(() => 'unknown error');
      throw new Error(`Microsoft Calendar ${action} failed (${res.status}): ${err}`);
    }
  }

  private buildEventBody(event: Partial<CreateEventInput>): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    if (event.title !== undefined) body['subject'] = event.title;
    if (event.description !== undefined) body['body'] = { contentType: 'text', content: event.description };
    if (event.location !== undefined) body['location'] = { displayName: event.location };
    if (event.isAllDay !== undefined) body['isAllDay'] = event.isAllDay;

    if (event.startAt) {
      body['start'] = { dateTime: event.startAt.toISOString(), timeZone: event.timezone ?? 'UTC' };
    }
    if (event.endAt) {
      body['end'] = { dateTime: event.endAt.toISOString(), timeZone: event.timezone ?? 'UTC' };
    }

    if (event.attendees) {
      body['attendees'] = event.attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: 'required',
      }));
    }

    if (event.reminders && event.reminders.length > 0) {
      body['isReminderOn'] = true;
      body['reminderMinutesBeforeStart'] = event.reminders[0]?.minutesBefore ?? 15;
    }

    return body;
  }

  private mapEvent(raw: Record<string, unknown>, calendarId: string): ProviderEvent {
    const start = raw['start'] as Record<string, string> | undefined;
    const end = raw['end'] as Record<string, string> | undefined;

    const startAt = start?.['dateTime'] ? new Date(start['dateTime']) : new Date();
    const endAt = end?.['dateTime'] ? new Date(end['dateTime']) : new Date();
    const timezone = start?.['timeZone'] ?? 'UTC';

    const bodyContent = (raw['body'] as Record<string, string> | undefined)?.['content'];
    const locationName = (raw['location'] as Record<string, string> | undefined)?.['displayName'];
    const isCancelled = raw['isCancelled'] === true;

    const attendees = (raw['attendees'] as Array<Record<string, unknown>> | undefined)?.map((a) => {
      const emailAddr = a['emailAddress'] as Record<string, string> | undefined;
      const statusMap: Record<string, 'accepted' | 'declined' | 'tentative' | 'needsAction'> = {
        accepted: 'accepted',
        declined: 'declined',
        tentativelyAccepted: 'tentative',
        none: 'needsAction',
      };
      return {
        email: emailAddr?.['address'] ?? '',
        name: emailAddr?.['name'],
        status: statusMap[String(a['status'] ?? 'none')] ?? 'needsAction',
      };
    });

    return {
      id: String(raw['id'] ?? ''),
      calendarId,
      title: String(raw['subject'] ?? '(No title)'),
      description: bodyContent || undefined,
      location: locationName || undefined,
      startAt,
      endAt,
      timezone,
      isAllDay: Boolean(raw['isAllDay']),
      status: isCancelled ? 'cancelled' : 'confirmed',
      attendees,
      htmlLink: raw['webLink'] ? String(raw['webLink']) : undefined,
      isCancelled,
    };
  }
}
