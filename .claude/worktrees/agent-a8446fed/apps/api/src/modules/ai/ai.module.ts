import { Module } from '@nestjs/common';
import { AIProvidersService } from './ai-providers.service';
import { AICompletionService } from './ai-completion.service';
import { AIConversationsService } from './ai-conversations.service';
import { AIMemoryService } from './ai-memory.service';
import { AIKnowledgeService } from './ai-knowledge.service';
import { AIUsageService } from './ai-usage.service';
import {
  AIProvidersController,
  AIConversationsController,
  AIMemoryController,
  AIKnowledgeController,
  AIUsageController,
} from './ai.controller';

@Module({
  providers: [
    AIProvidersService,
    AICompletionService,
    AIConversationsService,
    AIMemoryService,
    AIKnowledgeService,
    AIUsageService,
  ],
  controllers: [
    AIProvidersController,
    AIConversationsController,
    AIMemoryController,
    AIKnowledgeController,
    AIUsageController,
  ],
  exports: [
    AIProvidersService,
    AICompletionService,
    AIMemoryService,
  ],
})
export class AIModule {}
