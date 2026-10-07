import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommunicationsModule } from '../communications/communications.module';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { MicrosoftCalendarProvider } from './providers/microsoft-calendar.provider';
import { CalendarProviderFactory } from './providers/calendar-provider.factory';
import { CalendarConnectionsService } from './calendar-connections.service';
import { CalendarEventsService } from './calendar-events.service';
import {
  CalendarOAuthController,
  CalendarConnectionsController,
  CalendarEventsController,
  CalendarAvailabilityController,
} from './calendar.controller';

@Module({
  imports: [AuditModule, CommunicationsModule],
  providers: [
    GoogleCalendarProvider,
    MicrosoftCalendarProvider,
    CalendarProviderFactory,
    CalendarConnectionsService,
    CalendarEventsService,
  ],
  controllers: [
    CalendarOAuthController,
    CalendarConnectionsController,
    CalendarEventsController,
    CalendarAvailabilityController,
  ],
  exports: [CalendarConnectionsService, CalendarEventsService],
})
export class CalendarModule {}
