import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { QueueService } from '../../common/services/queue.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async getOverviewStats(organizationId: string) {
    const [
      userCount,
      activeUserCount,
      roleCount,
      agentCount,
      pendingApprovals,
      apiKeyCount,
      featureFlagCount,
    ] = await Promise.all([
      this.prisma.user.count({ where: { organizationId } }),
      this.prisma.user.count({ where: { organizationId, isActive: true } }),
      this.prisma.role.count({ where: { organizationId } }),
      this.prisma.externalAgent.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.aIAction.count({ where: { organizationId, status: 'PENDING' } }),
      this.prisma.aPIKey.count({ where: { organizationId, isActive: true } }),
      this.prisma.featureFlag.count({ where: { organizationId, isEnabled: true } }),
    ]);

    return {
      users: { total: userCount, active: activeUserCount },
      roles: roleCount,
      agents: agentCount,
      pendingApprovals,
      apiKeys: apiKeyCount,
      activeFeatureFlags: featureFlagCount,
    };
  }

  async getSecurityEvents(organizationId: string, limit = 50) {
    const events = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        action: {
          in: [
            'LOGIN_FAILED',
            'API_KEY_REVOKED',
            'API_KEY_ROTATED',
            'AGENT_SUSPENDED',
            'AGENT_REVOKED',
            'PERMISSION_OVERRIDE_SET',
            'PERMISSION_OVERRIDE_REMOVED',
            'USER_DEACTIVATED',
            'AUTH_DENIED',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return events;
  }

  async listApiKeys(organizationId: string) {
    return this.prisma.aPIKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        createdBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeApiKey(organizationId: string, keyId: string) {
    const key = await this.prisma.aPIKey.findFirst({
      where: { id: keyId, organizationId },
    });
    if (!key) throw new Error('NOT_FOUND');

    return this.prisma.aPIKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });
  }

  async getWorkerHealth() {
    const [queueStats, scheduledAgents] = await Promise.all([
      this.queue.getAllQueueStats(),
      this.prisma.aIScheduledAgent.count({ where: { isActive: true } }),
    ]);

    return {
      queues: queueStats,
      scheduledAgents,
    };
  }
}
