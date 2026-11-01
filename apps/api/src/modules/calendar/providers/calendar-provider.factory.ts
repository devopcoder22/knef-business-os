import { Injectable } from '@nestjs/common';
import { GoogleCalendarProvider } from './google-calendar.provider';
import { MicrosoftCalendarProvider } from './microsoft-calendar.provider';
import type { CalendarProvider } from './calendar-provider.interface';

export type CalendarProviderName = 'google' | 'microsoft';

@Injectable()
export class CalendarProviderFactory {
  constructor(
    private readonly google: GoogleCalendarProvider,
    private readonly microsoft: MicrosoftCalendarProvider,
  ) {}

  getProvider(name: CalendarProviderName): CalendarProvider {
    switch (name) {
      case 'google':
        return this.google;
      case 'microsoft':
        return this.microsoft;
      default: {
        const _exhaustive: never = name;
        throw new Error(`Unsupported calendar provider: ${_exhaustive}`);
      }
    }
  }

  isSupported(name: string): name is CalendarProviderName {
    return name === 'google' || name === 'microsoft';
  }
}
