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
import {
  AIToolsController,
  AIApprovalsController,
  AIScheduledAgentsController,
} from './ai-actions.controller';

@Module({
  imports: [AIModule, CommunicationsModule, PermissionsModule, AuditModule],
  providers: [
    AIToolExecutorService,
    AIToolsService,
    AIApprovalsService,
    AIScheduledAgentsService,
    AIPermissionCheckerService,
  ],
  controllers: [
    AIToolsController,
    AIApprovalsController,
    AIScheduledAgentsController,
  ],
  exports: [AIPermissionCheckerService],
})
export class AIActionsModule {}
