import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CalendarConnectionsService } from './calendar-connections.service';
import { CalendarProviderFactory, CalendarProviderName } from './providers/calendar-provider.factory';
import type { CreateCalendarEventDto } from './dto/create-event.dto';
import type { UpdateCalendarEventDto } from './dto/update-event.dto';
import type { ListCalendarEventsDto } from './dto/list-events.dto';
import type { FindAvailabilityDto } from './dto/find-availability.dto';
import type { CreateEventInput, ProviderEvent } from './providers/calendar-provider.interface';

@Injectable()
export class CalendarEventsService {
  private readonly logger = new Logger(CalendarEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly connections: CalendarConnectionsService,
    private readonly providerFactory: CalendarProviderFactory,
  ) {}

  // ── List events ────────────────────────────────────────────────────────────

  async listEvents(organizationId: string, userId: string, connectionId: string, query: ListCalendarEventsDto) {
    const tokenData = await this.connections.getValidTokens(connectionId);
    this.assertOwnership(tokenData.connection, organizationId, userId);

    const provider = this.providerFactory.getProvider(tokenData.connection.provider as CalendarProviderName);
    const calendarId = query.calendarId ?? tokenData.connection.calendarId ?? 'primary';

    const result = await provider.listEvents(tokenData, calendarId, {
      timeMin: query.timeMin ? new Date(query.timeMin) : undefined,
      timeMax: query.timeMax ? new Date(query.timeMax) : undefined,
      pageToken: query.pageToken,
      maxResults: query.limit ?? 100,
    });

    // Upsert events into local cache (idempotent)
    await this.upsertEvents(result.events, connectionId, organizationId, userId, calendarId, tokenData.connection.provider);

    return {
      data: result.events,
      nextPageToken: result.nextPageToken,
    };
  }

  // ── Get cached events from DB ──────────────────────────────────────────────

  async getCachedEvents(organizationId: string, userId: string, query: ListCalendarEventsDto) {
    const where: Record<string, unknown> = { organizationId, userId };
    if (query.calendarId) where['externalCalendarId'] = query.calendarId;
    if (query.timeMin || query.timeMax) {
      where['startAt'] = {
        ...(query.timeMin ? { gte: new Date(query.timeMin) } : {}),
        ...(query.timeMax ? { lte: new Date(query.timeMax) } : {}),
      };
    }

    const events = await this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startAt: 'asc' },
      take: query.limit ?? 100,
    });

    return { data: events };
  }

  // ── Get single event ───────────────────────────────────────────────────────

  async getEvent(organizationId: string, userId: string, eventId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!event) throw new NotFoundException('Calendar event not found');

    // Enforce user isolation — users can only see their own events
    if (event.userId !== userId) {
      throw new ForbiddenException('Access denied to this calendar event');
    }

    return event;
  }

  // ── Create event ───────────────────────────────────────────────────────────

  async createEvent(organizationId: string, userId: string, connectionId: string, dto: CreateCalendarEventDto) {
    const tokenData = await this.connections.getValidTokens(connectionId);
    this.assertOwnership(tokenData.connection, organizationId, userId);

    const provider = this.providerFactory.getProvider(tokenData.connection.provider as CalendarProviderName);
    const calendarId = dto.calendarId ?? tokenData.connection.calendarId ?? 'primary';

    const input: CreateEventInput = {
      title: dto.title,
      description: dto.description,
      location: dto.location,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      timezone: dto.timezone,
      isAllDay: dto.isAllDay ?? false,
      attendees: dto.attendees,
      reminders: dto.reminders as CreateEventInput['reminders'],
      recurrence: dto.recurrence,
    };

    if (input.endAt <= input.startAt) {
      throw new BadRequestException('Event end time must be after start time');
    }

    const created = await provider.createEvent(tokenData, calendarId, input);

    // Store in local cache
    const stored = await this.prisma.calendarEvent.create({
      data: {
        id: createId(),
        organizationId,
        userId,
        integrationId: connectionId,
        externalEventId: created.id,
        externalCalendarId: calendarId,
        provider: tokenData.connection.provider,
        title: created.title,
        description: created.description ?? null,
        location: created.location ?? null,
        startAt: created.startAt,
        endAt: created.endAt,
        timezone: created.timezone,
        isAllDay: created.isAllDay,
        status: created.status,
        attendees: created.attendees ? JSON.parse(JSON.stringify(created.attendees)) : undefined,
        recurrence: created.recurrence ? JSON.parse(JSON.stringify(created.recurrence)) : undefined,
        reminders: created.reminders ? JSON.parse(JSON.stringify(created.reminders)) : undefined,
        htmlLink: created.htmlLink ?? null,
        syncedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CALENDAR_EVENT_CREATED',
      entity: 'CalendarEvent',
      entityId: stored.id,
      metadata: { provider: tokenData.connection.provider, calendarId, title: dto.title },
    });

    return stored;
  }

  // ── Update event ───────────────────────────────────────────────────────────

  async updateEvent(organizationId: string, userId: string, eventId: string, dto: UpdateCalendarEventDto) {
    const localEvent = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!localEvent) throw new NotFoundException('Calendar event not found');
    if (localEvent.userId !== userId) throw new ForbiddenException('Access denied to this calendar event');

    const tokenData = await this.connections.getValidTokens(localEvent.integrationId);
    const provider = this.providerFactory.getProvider(localEvent.provider as CalendarProviderName);

    const input: Partial<CreateEventInput> = {
      title: dto.title,
      description: dto.description,
      location: dto.location,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
      timezone: dto.timezone,
      isAllDay: dto.isAllDay,
      attendees: dto.attendees,
      reminders: dto.reminders as CreateEventInput['reminders'],
      recurrence: dto.recurrence,
    };

    if (input.startAt && input.endAt && input.endAt <= input.startAt) {
      throw new BadRequestException('Event end time must be after start time');
    }

    const updated = await provider.updateEvent(tokenData, localEvent.externalCalendarId, localEvent.externalEventId, input);

    const stored = await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        title: updated.title,
        description: updated.description ?? null,
        location: updated.location ?? null,
        startAt: updated.startAt,
        endAt: updated.endAt,
        timezone: updated.timezone,
        isAllDay: updated.isAllDay,
        status: updated.status,
        attendees: updated.attendees ? JSON.parse(JSON.stringify(updated.attendees)) : undefined,
        recurrence: updated.recurrence ? JSON.parse(JSON.stringify(updated.recurrence)) : undefined,
        htmlLink: updated.htmlLink ?? null,
        syncedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CALENDAR_EVENT_UPDATED',
      entity: 'CalendarEvent',
      entityId: eventId,
      metadata: { provider: localEvent.provider },
    });

    return stored;
  }

  // ── Delete event ───────────────────────────────────────────────────────────

  async deleteEvent(organizationId: string, userId: string, eventId: string) {
    const localEvent = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!localEvent) throw new NotFoundException('Calendar event not found');
    if (localEvent.userId !== userId) throw new ForbiddenException('Access denied to this calendar event');

    const tokenData = await this.connections.getValidTokens(localEvent.integrationId);
    const provider = this.providerFactory.getProvider(localEvent.provider as CalendarProviderName);

    await provider.deleteEvent(tokenData, localEvent.externalCalendarId, localEvent.externalEventId);
    await this.prisma.calendarEvent.delete({ where: { id: eventId } });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CALENDAR_EVENT_DELETED',
      entity: 'CalendarEvent',
      entityId: eventId,
      metadata: { provider: localEvent.provider },
    });

    return { message: 'Event deleted' };
  }

  // ── Find availability ──────────────────────────────────────────────────────

  async findAvailability(organizationId: string, userId: string, connectionId: string, dto: FindAvailabilityDto) {
    const tokenData = await this.connections.getValidTokens(connectionId);
    this.assertOwnership(tokenData.connection, organizationId, userId);

    const provider = this.providerFactory.getProvider(tokenData.connection.provider as CalendarProviderName);

    const busySlots = await provider.findAvailability(tokenData, {
      timeMin: new Date(dto.timeMin),
      timeMax: new Date(dto.timeMax),
      timezone: dto.timezone,
      calendarIds: dto.calendarIds,
    });

    return { busySlots };
  }

  // ── Sync (on-demand) ───────────────────────────────────────────────────────

  async syncEvents(organizationId: string, userId: string, connectionId: string) {
    const tokenData = await this.connections.getValidTokens(connectionId);
    this.assertOwnership(tokenData.connection, organizationId, userId);

    const conn = await this.prisma.calendarIntegration.findFirst({
      where: { id: connectionId },
    });
    if (!conn) throw new NotFoundException('Connection not found');

    const provider = this.providerFactory.getProvider(conn.provider as CalendarProviderName);
    const calendarId = conn.calendarId ?? 'primary';

    // Sync last 30 days + next 90 days
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    let pageToken: string | undefined;
    let synced = 0;

    do {
      const result = await provider.listEvents(tokenData, calendarId, {
        timeMin: conn.syncToken ? undefined : timeMin,
        timeMax: conn.syncToken ? undefined : timeMax,
        syncToken: conn.syncToken ?? undefined,
        pageToken,
        maxResults: 250,
      });

      await this.upsertEvents(result.events, connectionId, organizationId, userId, calendarId, conn.provider);
      synced += result.events.length;
      pageToken = result.nextPageToken;

      if (!pageToken && result.nextSyncToken) {
        await this.prisma.calendarIntegration.update({
          where: { id: connectionId },
          data: { syncToken: result.nextSyncToken, lastSyncAt: new Date() },
        });
      }
    } while (pageToken);

    if (!conn.syncToken) {
      await this.prisma.calendarIntegration.update({
        where: { id: connectionId },
        data: { lastSyncAt: new Date() },
      });
    }

    return { synced };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private assertOwnership(
    connection: { organizationId: string; userId: string },
    organizationId: string,
    userId: string,
  ) {
    if (connection.organizationId !== organizationId || connection.userId !== userId) {
      throw new ForbiddenException('Access denied to this calendar connection');
    }
  }

  private async upsertEvents(
    events: ProviderEvent[],
    connectionId: string,
    organizationId: string,
    userId: string,
    calendarId: string,
    provider: string,
  ) {
    for (const event of events) {
      if (event.isCancelled) {
        await this.prisma.calendarEvent
          .deleteMany({ where: { integrationId: connectionId, externalEventId: event.id } })
          .catch(() => {});
        continue;
      }

      await this.prisma.calendarEvent.upsert({
        where: {
          integrationId_externalEventId: { integrationId: connectionId, externalEventId: event.id },
        },
        create: {
          id: createId(),
          organizationId,
          userId,
          integrationId: connectionId,
          externalEventId: event.id,
          externalCalendarId: calendarId,
          provider,
          title: event.title,
          description: event.description ?? null,
          location: event.location ?? null,
          startAt: event.startAt,
          endAt: event.endAt,
          timezone: event.timezone,
          isAllDay: event.isAllDay,
          status: event.status,
          attendees: event.attendees ? JSON.parse(JSON.stringify(event.attendees)) : undefined,
          recurrence: event.recurrence ? JSON.parse(JSON.stringify(event.recurrence)) : undefined,
          htmlLink: event.htmlLink ?? null,
          syncedAt: new Date(),
        },
        update: {
          title: event.title,
          description: event.description ?? null,
          location: event.location ?? null,
          startAt: event.startAt,
          endAt: event.endAt,
          timezone: event.timezone,
          isAllDay: event.isAllDay,
          status: event.status,
          attendees: event.attendees ? JSON.parse(JSON.stringify(event.attendees)) : undefined,
          recurrence: event.recurrence ? JSON.parse(JSON.stringify(event.recurrence)) : undefined,
          htmlLink: event.htmlLink ?? null,
          syncedAt: new Date(),
        },
      }).catch((err: unknown) => {
        this.logger.warn(`Failed to upsert event ${event.id}: ${String(err)}`);
      });
    }
  }
}
