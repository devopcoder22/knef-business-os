export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface CalendarInfo {
  id: string;
  name: string;
  isPrimary: boolean;
  accessRole: string;
  backgroundColor?: string;
  timeZone?: string;
}

export interface EventAttendee {
  email: string;
  name?: string;
  status?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer?: boolean;
}

export interface EventReminder {
  method: 'email' | 'popup' | 'sms';
  minutesBefore: number;
}

export interface ProviderEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  isAllDay: boolean;
  status: string;
  attendees?: EventAttendee[];
  recurrence?: string[];
  reminders?: EventReminder[];
  htmlLink?: string;
  isCancelled?: boolean;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  isAllDay?: boolean;
  attendees?: Pick<EventAttendee, 'email' | 'name'>[];
  reminders?: EventReminder[];
  recurrence?: string[];
}

export interface ListEventsParams {
  timeMin?: Date;
  timeMax?: Date;
  pageToken?: string;
  syncToken?: string;
  maxResults?: number;
}

export interface ListEventsResult {
  events: ProviderEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface AvailabilityParams {
  timeMin: Date;
  timeMax: Date;
  calendarIds?: string[];
  timezone: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface CalendarProvider {
  readonly providerName: string;

  getAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
  testConnection(tokens: OAuthTokens): Promise<boolean>;

  listCalendars(tokens: OAuthTokens): Promise<CalendarInfo[]>;

  listEvents(tokens: OAuthTokens, calendarId: string, params: ListEventsParams): Promise<ListEventsResult>;
  getEvent(tokens: OAuthTokens, calendarId: string, eventId: string): Promise<ProviderEvent>;
  createEvent(tokens: OAuthTokens, calendarId: string, event: CreateEventInput): Promise<ProviderEvent>;
  updateEvent(tokens: OAuthTokens, calendarId: string, eventId: string, event: Partial<CreateEventInput>): Promise<ProviderEvent>;
  deleteEvent(tokens: OAuthTokens, calendarId: string, eventId: string): Promise<void>;

  findAvailability(tokens: OAuthTokens, params: AvailabilityParams): Promise<TimeSlot[]>;
}
