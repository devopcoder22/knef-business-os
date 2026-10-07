import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  BadRequestException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CalendarConnectionsService } from './calendar-connections.service';
import { CalendarEventsService } from './calendar-events.service';
import { CalendarProviderFactory, CalendarProviderName } from './providers/calendar-provider.factory';
import { CreateCalendarEventDto } from './dto/create-event.dto';
import { UpdateCalendarEventDto } from './dto/update-event.dto';
import { ListCalendarEventsDto } from './dto/list-events.dto';
import { FindAvailabilityDto } from './dto/find-availability.dto';

// ─── OAuth (unauthenticated callback routes) ─────────────────────────────────

@ApiTags('calendar-oauth')
@Controller('calendar/oauth')
export class CalendarOAuthController {
  private readonly logger = new Logger(CalendarOAuthController.name);

  constructor(private readonly connections: CalendarConnectionsService) {}

  @Public()
  @Get(':provider/callback')
  @ApiOperation({ summary: 'OAuth callback — called by provider after authorization' })
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendBase = process.env['ALLOWED_ORIGINS']?.split(',')[0] ?? 'http://localhost:3000';
    const settingsUrl = `${frontendBase}/calendar/settings`;

    if (error) {
      this.logger.warn(`OAuth error for ${provider}: ${error}`);
      return res.redirect(`${settingsUrl}?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${settingsUrl}?error=missing_params`);
    }

    try {
      const { connectionId } = await this.connections.handleCallback(code, state);
      return res.redirect(`${settingsUrl}?connected=true&connectionId=${connectionId}`);
    } catch (err) {
      this.logger.error(`Calendar callback error for ${provider}`, err);
      return res.redirect(`${settingsUrl}?error=callback_failed`);
    }
  }
}

// ─── Connections ─────────────────────────────────────────────────────────────

@ApiTags('calendar')
@ApiBearerAuth('JWT')
@Controller('calendar/connections')
export class CalendarConnectionsController {
  constructor(
    private readonly connections: CalendarConnectionsService,
    private readonly providerFactory: CalendarProviderFactory,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.CALENDAR.VIEW)
  @ApiOperation({ summary: 'List my calendar connections' })
  list(@CurrentUser() user: AuthUser) {
    return this.connections.listConnections(user.organizationId, user.id);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CALENDAR.VIEW)
  @ApiOperation({ summary: 'Get a specific calendar connection' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connections.getConnection(user.organizationId, user.id, id);
  }

  @Post(':provider/authorize')
  @Permissions(PERMISSIONS.CALENDAR.MANAGE_CONNECTIONS)
  @ApiOperation({ summary: 'Get OAuth authorization URL for a provider' })
  async authorize(@CurrentUser() user: AuthUser, @Param('provider') provider: string) {
    if (!this.providerFactory.isSupported(provider)) {
      throw new BadRequestException(`Unsupported provider: ${provider}. Supported: google, microsoft`);
    }
    return this.connections.getAuthorizationUrl(user.id, user.organizationId, provider as CalendarProviderName);
  }

  @Get(':id/calendars')
  @Permissions(PERMISSIONS.CALENDAR.VIEW)
  @ApiOperation({ summary: 'List calendars available on this connection' })
  listCalendars(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connections.listCalendars(user.organizationId, user.id, id);
  }

  @Patch(':id/default-calendar')
  @Permissions(PERMISSIONS.CALENDAR.MANAGE_CONNECTIONS)
  @ApiOperation({ summary: 'Set the default calendar for a connection' })
  setDefaultCalendar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { calendarId: string; calendarName?: string },
  ) {
    return this.connections.setDefaultCalendar(user.organizationId, user.id, id, body.calendarId, body.calendarName);
  }

  @Get(':id/test')
  @Permissions(PERMISSIONS.CALENDAR.VIEW)
  @ApiOperation({ summary: 'Test a calendar connection' })
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connections.testConnection(user.organizationId, user.id, id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.CALENDAR.MANAGE_CONNECTIONS)
  @ApiOperation({ summary: 'Disconnect a calendar' })
  disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connections.disconnect(user.organizationId, user.id, id);
  }
}

// ─── Events ──────────────────────────────────────────────────────────────────

@ApiTags('calendar')
@ApiBearerAuth('JWT')
@Controller('calendar/events')
export class CalendarEventsController {
  constructor(private readonly events: CalendarEventsService) {}

  @Get()
  @Permissions(PERMISSIONS.CALENDAR.VIEW)
  @ApiOperation({ summary: 'Get cached calendar events' })
  getCached(@CurrentUser() user: AuthUser, @Query() query: ListCalendarEventsDto) {
    return this.events.getCachedEvents(user.organizationId, user.id, query);
  }

  @Get('sync/:connectionId')
  @Permissions(PERMISSIONS.CALENDAR.VIEW)
  @ApiOperation({ summary: 'Sync events from provider and return results' })
  syncAndList(
    @CurrentUser() user: AuthUser,
    @Param('connectionId') connectionId: string,
    @Query() query: ListCalendarEventsDto,
  ) {
    return this.events.listEvents(user.organizationId, user.id, connectionId, query);
  }

  @Post('sync/:connectionId')
  @Permissions(PERMISSIONS.CALENDAR.VIEW)
  @ApiOperation({ summary: 'Trigger on-demand sync for a connection' })
  sync(@CurrentUser() user: AuthUser, @Param('connectionId') connectionId: string) {
    return this.events.syncEvents(user.organizationId, user.id, connectionId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CALENDAR.VIEW)
  @ApiOperation({ summary: 'Get a single calendar event' })
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.getEvent(user.organizationId, user.id, id);
  }

  @Post(':connectionId')
  @Permissions(PERMISSIONS.CALENDAR.CREATE)
  @ApiOperation({ summary: 'Create a calendar event' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('connectionId') connectionId: string,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.events.createEvent(user.organizationId, user.id, connectionId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.CALENDAR.UPDATE)
  @ApiOperation({ summary: 'Update a calendar event' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.events.updateEvent(user.organizationId, user.id, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.CALENDAR.DELETE)
  @ApiOperation({ summary: 'Delete a calendar event' })
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.deleteEvent(user.organizationId, user.id, id);
  }
}

// ─── Availability ─────────────────────────────────────────────────────────────

@ApiTags('calendar')
@ApiBearerAuth('JWT')
@Controller('calendar/availability')
export class CalendarAvailabilityController {
  constructor(private readonly events: CalendarEventsService) {}

  @Get(':connectionId')
  @Permissions(PERMISSIONS.CALENDAR.VIEW_AVAILABILITY)
  @ApiOperation({ summary: 'Find busy slots for availability planning' })
  findAvailability(
    @CurrentUser() user: AuthUser,
    @Param('connectionId') connectionId: string,
    @Query() dto: FindAvailabilityDto,
  ) {
    return this.events.findAvailability(user.organizationId, user.id, connectionId, dto);
  }
}
