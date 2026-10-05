import { Module } from '@nestjs/common';
import { BusinessRuleService } from './business-rules.service';
import { BusinessRulesController } from './business-rules.controller';
import { SettingsModule } from '../settings/settings.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [SettingsModule, AuditModule],
  providers: [BusinessRuleService],
  controllers: [BusinessRulesController],
  exports: [BusinessRuleService],
})
export class BusinessRulesModule {}
