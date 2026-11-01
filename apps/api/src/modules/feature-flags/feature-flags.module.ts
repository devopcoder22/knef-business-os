import { Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { UserFeatureFlagsService } from './user-feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [FeatureFlagsService, UserFeatureFlagsService],
  controllers: [FeatureFlagsController],
  exports: [FeatureFlagsService, UserFeatureFlagsService],
})
export class FeatureFlagsModule {}
