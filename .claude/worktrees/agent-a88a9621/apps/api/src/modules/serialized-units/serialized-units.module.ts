import { Module } from '@nestjs/common';
import { SerializedUnitsService } from './serialized-units.service';
import { SerializedUnitsController } from './serialized-units.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [SerializedUnitsService],
  controllers: [SerializedUnitsController],
  exports: [SerializedUnitsService],
})
export class SerializedUnitsModule {}
