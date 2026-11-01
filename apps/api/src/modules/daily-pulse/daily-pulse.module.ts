import { Module } from '@nestjs/common';
import { DailyPulseService } from './daily-pulse.service';
import { DailyPulseConfigService } from './daily-pulse-config.service';
import { DailyPulseController } from './daily-pulse.controller';

@Module({
  providers: [DailyPulseService, DailyPulseConfigService],
  controllers: [DailyPulseController],
  exports: [DailyPulseService, DailyPulseConfigService],
})
export class DailyPulseModule {}
