import { Module } from '@nestjs/common';
import { CycleCountsService } from './cycle-counts.service';
import { CycleCountsController } from './cycle-counts.controller';

@Module({
  providers: [CycleCountsService],
  controllers: [CycleCountsController],
  exports: [CycleCountsService],
})
export class CycleCountsModule {}
