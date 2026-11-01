import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExternalAgentsService } from './external-agents.service';
import { createHash } from 'crypto';

/**
 * Authenticates external agent requests via X-Api-Key header.
 *
 * On success, attaches to request:
 *   request.apiKey         — the validated APIKey record
 *   request.organizationId — the org from the API key
 *   request.externalAgent  — the ExternalAgent linked to this key
 *
 * This guard supersedes ApiKeyGuard for agent gateway routes and additionally
 * resolves the ExternalAgent identity so controllers don't need separate lookups.
 */
@Injectable()
export class ExternalAgentAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: ExternalAgentsService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string>;
    const rawKey = headers['x-api-key'];

    if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'X-Api-Key header required',
      });
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.aPIKey.findFirst({ where: { keyHash } });

    if (!apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid API key',
      });
    }

    if (!apiKey.isActive) {
      this.audit
        .log({
          organizationId: apiKey.organizationId,
          action: 'AGENT_AUTH_DENIED',
          entity: 'ExternalAgent',
          metadata: { keyId: apiKey.id, reason: 'revoked' },
        })
        .catch(() => {});
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'API key has been revoked',
      });
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      this.audit
        .log({
          organizationId: apiKey.organizationId,
          action: 'AGENT_AUTH_DENIED',
          entity: 'ExternalAgent',
          metadata: { keyId: apiKey.id, reason: 'expired' },
        })
        .catch(() => {});
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'API key expired',
      });
    }

    const agent = await this.agentsService.resolveAgentByApiKeyId(
      apiKey.id,
      apiKey.organizationId,
    );

    if (!agent) {
      this.audit
        .log({
          organizationId: apiKey.organizationId,
          action: 'AGENT_AUTH_DENIED',
          entity: 'ExternalAgent',
          metadata: { keyId: apiKey.id, reason: 'no_agent_linked' },
        })
        .catch(() => {});
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'No active external agent linked to this API key',
      });
    }

    if (agent.status !== 'ACTIVE') {
      this.audit
        .log({
          organizationId: apiKey.organizationId,
          action: 'AGENT_AUTH_DENIED',
          entity: 'ExternalAgent',
          entityId: agent.id,
          metadata: { reason: 'agent_suspended', status: agent.status },
        })
        .catch(() => {});
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: `External agent is ${agent.status.toLowerCase()}`,
      });
    }

    // Non-blocking lastUsedAt updates
    this.prisma.aPIKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    this.prisma.externalAgent
      .update({ where: { id: agent.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    request['apiKey'] = apiKey;
    request['organizationId'] = apiKey.organizationId;
    request['externalAgent'] = agent;

    return true;
  }
}
