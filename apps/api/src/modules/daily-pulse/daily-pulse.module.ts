import { Module } from '@nestjs/common';
import { DailyPulseService } from './daily-pulse.service';
import { DailyPulseController } from './daily-pulse.controller';

@Module({
  providers: [DailyPulseService],
  controllers: [DailyPulseController],
  exports: [DailyPulseService],
})
export class DailyPulseModule {}
