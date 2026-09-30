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

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_FREEBUSY_URL = `${GOOGLE_CALENDAR_BASE}/freeBusy`;

// Scopes required for calendar read/write + freebusy
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  readonly providerName = 'google';
  private readonly logger = new Logger(GoogleCalendarProvider.name);

  private get clientId(): string {
    return this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
  }

  private get clientSecret(): string {
    return this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET');
  }

  private get redirectUri(): string {
    return this.configService.getOrThrow<string>('GOOGLE_CALENDAR_REDIRECT_URI');
  }

  constructor(private readonly configService: ConfigService) {}

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Google token exchange failed: ${err}`);
      throw new UnauthorizedException('Failed to exchange Google OAuth code');
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
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Google token refresh failed: ${err}`);
      throw new UnauthorizedException('Google Calendar token refresh failed. Please reconnect.');
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  }

  async testConnection(tokens: OAuthTokens): Promise<boolean> {
    try {
      const res = await this.get(tokens, '/users/me/calendarList?maxResults=1');
      return res.ok;
    } catch {
      return false;
    }
  }

  async listCalendars(tokens: OAuthTokens): Promise<CalendarInfo[]> {
    const res = await this.get(tokens, '/users/me/calendarList');
    await this.assertOk(res, 'list calendars');
    const data = (await res.json()) as {
      items: Array<{
        id: string;
        summary: string;
        primary?: boolean;
        accessRole: string;
        backgroundColor?: string;
        timeZone?: string;
      }>;
    };

    return (data.items ?? []).map((c) => ({
      id: c.id,
      name: c.summary,
      isPrimary: c.primary ?? false,
      accessRole: c.accessRole,
      backgroundColor: c.backgroundColor,
      timeZone: c.timeZone,
    }));
  }

  async listEvents(
    tokens: OAuthTokens,
    calendarId: string,
    params: ListEventsParams,
  ): Promise<ListEventsResult> {
    const query = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime' });
    if (params.timeMin) query.set('timeMin', params.timeMin.toISOString());
    if (params.timeMax) query.set('timeMax', params.timeMax.toISOString());
    if (params.pageToken) query.set('pageToken', params.pageToken);
    if (params.syncToken) query.set('syncToken', params.syncToken);
    if (params.maxResults) query.set('maxResults', String(params.maxResults));

    const res = await this.get(tokens, `/calendars/${encodeURIComponent(calendarId)}/events?${query}`);
    await this.assertOk(res, 'list events');
    const data = (await res.json()) as {
      items: unknown[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };

    return {
      events: (data.items ?? []).map((e) => this.mapEvent(e as Record<string, unknown>, calendarId)),
      nextPageToken: data.nextPageToken,
      nextSyncToken: data.nextSyncToken,
    };
  }

  async getEvent(tokens: OAuthTokens, calendarId: string, eventId: string): Promise<ProviderEvent> {
    const res = await this.get(tokens, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
    await this.assertOk(res, 'get event');
    return this.mapEvent((await res.json()) as Record<string, unknown>, calendarId);
  }

  async createEvent(tokens: OAuthTokens, calendarId: string, event: CreateEventInput): Promise<ProviderEvent> {
    const body = this.buildEventBody(event);
    const res = await this.post(tokens, `/calendars/${encodeURIComponent(calendarId)}/events`, body);
    await this.assertOk(res, 'create event');
    return this.mapEvent((await res.json()) as Record<string, unknown>, calendarId);
  }

  async updateEvent(
    tokens: OAuthTokens,
    calendarId: string,
    eventId: string,
    event: Partial<CreateEventInput>,
  ): Promise<ProviderEvent> {
    const body = this.buildEventBody(event as CreateEventInput);
    const res = await this.patch(tokens, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, body);
    await this.assertOk(res, 'update event');
    return this.mapEvent((await res.json()) as Record<string, unknown>, calendarId);
  }

  async deleteEvent(tokens: OAuthTokens, calendarId: string, eventId: string): Promise<void> {
    const res = await this.request('DELETE', tokens, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
    if (!res.ok && res.status !== 404) {
      await this.assertOk(res, 'delete event');
    }
  }

  async findAvailability(tokens: OAuthTokens, params: AvailabilityParams): Promise<TimeSlot[]> {
    const calendarIds = params.calendarIds ?? ['primary'];
    const body = {
      timeMin: params.timeMin.toISOString(),
      timeMax: params.timeMax.toISOString(),
      timeZone: params.timezone,
      items: calendarIds.map((id) => ({ id })),
    };

    const res = await this.post(tokens, '', body, GOOGLE_FREEBUSY_URL);
    await this.assertOk(res, 'find availability');
    const data = (await res.json()) as {
      calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
    };

    const busySlots: TimeSlot[] = Object.values(data.calendars).flatMap((c) =>
      (c.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
    );

    return busySlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async get(tokens: OAuthTokens, path: string): Promise<Response> {
    return this.request('GET', tokens, path);
  }

  private async post(tokens: OAuthTokens, path: string, body: unknown, url?: string): Promise<Response> {
    return this.request('POST', tokens, path, body, url);
  }

  private async patch(tokens: OAuthTokens, path: string, body: unknown): Promise<Response> {
    return this.request('PATCH', tokens, path, body);
  }

  private async request(method: string, tokens: OAuthTokens, path: string, body?: unknown, overrideUrl?: string): Promise<Response> {
    const url = overrideUrl ?? `${GOOGLE_CALENDAR_BASE}${path}`;
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
        throw new UnauthorizedException('Google Calendar access token expired or revoked');
      }
      const err = await res.text().catch(() => 'unknown error');
      throw new Error(`Google Calendar ${action} failed (${res.status}): ${err}`);
    }
  }

  private buildEventBody(event: Partial<CreateEventInput>): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    if (event.title !== undefined) body['summary'] = event.title;
    if (event.description !== undefined) body['description'] = event.description;
    if (event.location !== undefined) body['location'] = event.location;

    if (event.startAt) {
      body['start'] = event.isAllDay
        ? { date: event.startAt.toISOString().split('T')[0] }
        : { dateTime: event.startAt.toISOString(), timeZone: event.timezone ?? 'UTC' };
    }
    if (event.endAt) {
      body['end'] = event.isAllDay
        ? { date: event.endAt.toISOString().split('T')[0] }
        : { dateTime: event.endAt.toISOString(), timeZone: event.timezone ?? 'UTC' };
    }

    if (event.attendees) {
      body['attendees'] = event.attendees.map((a) => ({ email: a.email, displayName: a.name }));
    }

    if (event.reminders) {
      body['reminders'] = {
        useDefault: false,
        overrides: event.reminders.map((r) => ({ method: r.method, minutes: r.minutesBefore })),
      };
    }

    if (event.recurrence) {
      body['recurrence'] = event.recurrence;
    }

    return body;
  }

  private mapEvent(raw: Record<string, unknown>, calendarId: string): ProviderEvent {
    const start = raw['start'] as Record<string, string> | undefined;
    const end = raw['end'] as Record<string, string> | undefined;
    const isAllDay = Boolean(start?.['date'] && !start?.['dateTime']);

    const startAt = start?.['dateTime']
      ? new Date(start['dateTime'])
      : start?.['date']
      ? new Date(start['date'] + 'T00:00:00Z')
      : new Date();

    const endAt = end?.['dateTime']
      ? new Date(end['dateTime'])
      : end?.['date']
      ? new Date(end['date'] + 'T00:00:00Z')
      : new Date();

    const timezone = (start?.['timeZone'] ?? 'UTC') as string;

    const attendees = (raw['attendees'] as Array<Record<string, unknown>> | undefined)?.map((a) => ({
      email: String(a['email'] ?? ''),
      name: a['displayName'] ? String(a['displayName']) : undefined,
      status: (a['responseStatus'] as 'accepted' | 'declined' | 'tentative' | 'needsAction') ?? 'needsAction',
      organizer: Boolean(a['organizer']),
    }));

    const remindersData = raw['reminders'] as Record<string, unknown> | undefined;
    const reminders = (remindersData?.['overrides'] as Array<Record<string, unknown>> | undefined)?.map((r) => ({
      method: String(r['method']) as 'email' | 'popup',
      minutesBefore: Number(r['minutes']),
    }));

    return {
      id: String(raw['id'] ?? ''),
      calendarId,
      title: String(raw['summary'] ?? '(No title)'),
      description: raw['description'] ? String(raw['description']) : undefined,
      location: raw['location'] ? String(raw['location']) : undefined,
      startAt,
      endAt,
      timezone,
      isAllDay,
      status: String(raw['status'] ?? 'confirmed'),
      attendees,
      recurrence: raw['recurrence'] as string[] | undefined,
      reminders,
      htmlLink: raw['htmlLink'] ? String(raw['htmlLink']) : undefined,
      isCancelled: raw['status'] === 'cancelled',
    };
  }
}
