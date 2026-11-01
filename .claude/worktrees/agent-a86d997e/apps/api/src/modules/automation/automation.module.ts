import { Module } from '@nestjs/common';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationConditionEvaluatorService } from './automation-condition-evaluator.service';
import { AutomationActionDispatcherService } from './automation-action-dispatcher.service';
import { AutomationEventsListener } from './automation-events.listener';
import { AutomationController } from './automation.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [
    AutomationRulesService,
    AutomationConditionEvaluatorService,
    AutomationActionDispatcherService,
    AutomationEventsListener,
  ],
  controllers: [AutomationController],
  exports: [AutomationRulesService, AutomationActionDispatcherService],
})
export class AutomationModule {}
