import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateExternalAgentDto, UpdateExternalAgentDto } from './dto/external-agents.dto';
import { getExternallyExposedTools } from '../ai-actions/ai-tool-permission.registry';
import type { ExternalAgent } from '@prisma/client';

export interface AgentWithApiKey {
  agent: ExternalAgent;
  /** Raw API key — only returned at creation time, never stored */
  rawApiKey?: string;
}

@Injectable()
export class ExternalAgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAgents(orgId: string) {
    const agents = await this.prisma.externalAgent.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: agents };
  }

  async getAgent(orgId: string, id: string): Promise<ExternalAgent> {
    const agent = await this.prisma.externalAgent.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!agent) throw new NotFoundException('External agent not found');
    return agent;
  }

  async createAgent(
    orgId: string,
    dto: CreateExternalAgentDto,
    actorId: string,
  ): Promise<AgentWithApiKey> {
    const existing = await this.prisma.externalAgent.findFirst({
      where: { organizationId: orgId, name: dto.name },
    });
    if (existing) throw new ConflictException('An agent with this name already exists');

    // Validate allowed tools against registry
    const exposedTools = new Set(getExternallyExposedTools().map((t) => t.toolName));
    for (const tool of dto.allowedTools ?? []) {
      if (!exposedTools.has(tool)) {
        throw new BadRequestException(`Tool "${tool}" is not externally exposed or does not exist`);
      }
    }

    const { rawKey, keyHash, prefix } = this.generateApiKey();

    const [apiKey, agent] = await this.prisma.$transaction(async (tx) => {
      const key = await tx.aPIKey.create({
        data: {
          id: createId(),
          organizationId: orgId,
          name: `Agent: ${dto.name}`,
          keyHash,
          prefix,
          scopes: dto.scopes ?? [],
          createdBy: actorId,
        },
      });

      const a = await tx.externalAgent.create({
        data: {
          id: createId(),
          organizationId: orgId,
          name: dto.name,
          description: dto.description ?? null,
          ownerId: actorId,
          status: 'ACTIVE',
          scopes: dto.scopes ?? [],
          allowedTools: dto.allowedTools ?? [],
          autonomyLevel: dto.autonomyLevel ?? 'APPROVAL_REQUIRED',
          rateLimitPerMinute: dto.rateLimitPerMinute ?? 60,
          apiKeyId: key.id,
        },
      });

      return [key, a] as const;
    });

    void apiKey; // used for id reference
    this.audit
      .log({
        organizationId: orgId,
        userId: actorId,
        action: 'EXTERNAL_AGENT_CREATED',
        entity: 'ExternalAgent',
        entityId: agent.id,
        metadata: { name: agent.name, scopes: agent.scopes, allowedTools: agent.allowedTools },
      })
      .catch(() => {});

    return { agent, rawApiKey: rawKey };
  }

  async updateAgent(
    orgId: string,
    id: string,
    dto: UpdateExternalAgentDto,
    actorId: string,
  ): Promise<ExternalAgent> {
    const agent = await this.getAgent(orgId, id);

    if (dto.allowedTools !== undefined) {
      const exposedTools = new Set(getExternallyExposedTools().map((t) => t.toolName));
      for (const tool of dto.allowedTools) {
        if (!exposedTools.has(tool)) {
          throw new BadRequestException(`Tool "${tool}" is not externally exposed or does not exist`);
        }
      }
    }

    const updated = await this.prisma.externalAgent.update({
      where: { id: agent.id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.scopes !== undefined && { scopes: dto.scopes }),
        ...(dto.allowedTools !== undefined && { allowedTools: dto.allowedTools }),
        ...(dto.autonomyLevel !== undefined && { autonomyLevel: dto.autonomyLevel }),
        ...(dto.rateLimitPerMinute !== undefined && { rateLimitPerMinute: dto.rateLimitPerMinute }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    // Sync scopes on the linked API key if scopes were updated
    if (dto.scopes !== undefined && agent.apiKeyId) {
      await this.prisma.aPIKey.update({
        where: { id: agent.apiKeyId },
        data: { scopes: dto.scopes },
      }).catch(() => {});
    }

    this.audit
      .log({
        organizationId: orgId,
        userId: actorId,
        action: 'EXTERNAL_AGENT_UPDATED',
        entity: 'ExternalAgent',
        entityId: id,
        metadata: { changes: dto },
      })
      .catch(() => {});

    return updated;
  }

  async deleteAgent(orgId: string, id: string, actorId: string): Promise<void> {
    const agent = await this.getAgent(orgId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.externalAgent.delete({ where: { id: agent.id } });
      if (agent.apiKeyId) {
        await tx.aPIKey.update({
          where: { id: agent.apiKeyId },
          data: { isActive: false },
        });
      }
    });

    this.audit
      .log({
        organizationId: orgId,
        userId: actorId,
        action: 'EXTERNAL_AGENT_DELETED',
        entity: 'ExternalAgent',
        entityId: id,
        metadata: { name: agent.name },
      })
      .catch(() => {});
  }

  async rotateApiKey(orgId: string, id: string, actorId: string): Promise<{ rawApiKey: string }> {
    const agent = await this.getAgent(orgId, id);
    const { rawKey, keyHash, prefix } = this.generateApiKey();

    await this.prisma.$transaction(async (tx) => {
      // Revoke old key
      if (agent.apiKeyId) {
        await tx.aPIKey.update({ where: { id: agent.apiKeyId }, data: { isActive: false } });
      }
      // Create new key
      const newKey = await tx.aPIKey.create({
        data: {
          id: createId(),
          organizationId: orgId,
          name: `Agent: ${agent.name}`,
          keyHash,
          prefix,
          scopes: agent.scopes,
          createdBy: actorId,
        },
      });
      await tx.externalAgent.update({
        where: { id: agent.id },
        data: { apiKeyId: newKey.id },
      });
    });

    this.audit
      .log({
        organizationId: orgId,
        userId: actorId,
        action: 'EXTERNAL_AGENT_KEY_ROTATED',
        entity: 'ExternalAgent',
        entityId: id,
        metadata: { name: agent.name },
      })
      .catch(() => {});

    return { rawApiKey: rawKey };
  }

  /** Resolve an ExternalAgent from an API key hash. Used by the gateway guard. */
  async resolveAgentByApiKeyId(apiKeyId: string, orgId: string): Promise<ExternalAgent | null> {
    return this.prisma.externalAgent.findFirst({
      where: { apiKeyId, organizationId: orgId, status: 'ACTIVE' },
    });
  }

  /** List externally exposed tools with their metadata. */
  listExposedTools() {
    return getExternallyExposedTools().map((t) => ({
      name: t.toolName,
      description: t.description,
      category: t.category,
      riskLevel: t.riskLevel,
      approvalRequired: t.approvalRequired,
      externalExposure: t.externalExposure,
      requiredScope: t.requiredScope,
      inputSchema: t.inputSchema,
    }));
  }

  private generateApiKey(): { rawKey: string; keyHash: string; prefix: string } {
    const raw = randomBytes(32).toString('hex');
    const prefix = `knef_agent_${raw.slice(0, 8)}`;
    const rawKey = `${prefix}_${raw.slice(8)}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    return { rawKey, keyHash, prefix };
  }
}
