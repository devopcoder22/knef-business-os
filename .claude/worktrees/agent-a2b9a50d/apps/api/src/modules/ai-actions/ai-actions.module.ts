import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { CommunicationsModule } from '../communications/communications.module';
import { AIToolExecutorService } from './ai-tool-executor.service';
import { AIToolsService } from './ai-tools.service';
import { AIApprovalsService } from './ai-approvals.service';
import { AIScheduledAgentsService } from './ai-scheduled-agents.service';
import {
  AIToolsController,
  AIApprovalsController,
  AIScheduledAgentsController,
} from './ai-actions.controller';

@Module({
  imports: [AIModule, CommunicationsModule],
  providers: [
    AIToolExecutorService,
    AIToolsService,
    AIApprovalsService,
    AIScheduledAgentsService,
  ],
  controllers: [
    AIToolsController,
    AIApprovalsController,
    AIScheduledAgentsController,
  ],
})
export class AIActionsModule {}
