import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { CommunicationsModule } from '../communications/communications.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { AIToolExecutorService } from './ai-tool-executor.service';
import { AIToolsService } from './ai-tools.service';
import { AIApprovalsService } from './ai-approvals.service';
import { AIScheduledAgentsService } from './ai-scheduled-agents.service';
import { AIPermissionCheckerService } from './ai-permission-checker.service';
import { AIExecutionPolicyService } from './ai-execution-policy.service';
import {
  AIToolsController,
  AIApprovalsController,
  AIScheduledAgentsController,
  AIAutonomyController,
} from './ai-actions.controller';

@Module({
  imports: [AIModule, CommunicationsModule, PermissionsModule, AuditModule],
  providers: [
    AIToolExecutorService,
    AIToolsService,
    AIApprovalsService,
    AIScheduledAgentsService,
    AIPermissionCheckerService,
    AIExecutionPolicyService,
  ],
  controllers: [
    AIToolsController,
    AIApprovalsController,
    AIScheduledAgentsController,
    AIAutonomyController,
  ],
  exports: [AIPermissionCheckerService, AIExecutionPolicyService, AIToolExecutorService],
})
export class AIActionsModule {}
