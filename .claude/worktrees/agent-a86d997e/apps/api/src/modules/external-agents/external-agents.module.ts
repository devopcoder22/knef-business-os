import { Module } from '@nestjs/common';
import { AIActionsModule } from '../ai-actions/ai-actions.module';
import { AuditModule } from '../audit/audit.module';
import { ExternalAgentsService } from './external-agents.service';
import { KnefToolLayerService } from './knef-tool-layer.service';
import { ExternalAgentAuthGuard } from './external-agent-auth.guard';
import { ExternalAgentsController } from './external-agents.controller';
import { AgentGatewayController } from './agent-gateway.controller';

@Module({
  imports: [AIActionsModule, AuditModule],
  providers: [ExternalAgentsService, KnefToolLayerService, ExternalAgentAuthGuard],
  controllers: [ExternalAgentsController, AgentGatewayController],
  exports: [KnefToolLayerService, ExternalAgentsService],
})
export class ExternalAgentsModule {}
