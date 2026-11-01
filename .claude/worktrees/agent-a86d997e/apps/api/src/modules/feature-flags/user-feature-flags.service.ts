import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

const VALID_STATES = ['INHERIT', 'ENABLED', 'DISABLED'] as const;
type FeatureState = (typeof VALID_STATES)[number];

@Injectable()
export class UserFeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async ensureUserInOrg(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getUserFlags(organizationId: string, userId: string) {
    await this.ensureUserInOrg(organizationId, userId);
    const flags = await this.prisma.userFeatureFlag.findMany({
      where: { userId },
      orderBy: { featureKey: 'asc' },
    });
    return { data: flags };
  }

  async getEffectiveFlags(organizationId: string, userId: string) {
    await this.ensureUserInOrg(organizationId, userId);

    const [orgFlags, userFlags] = await Promise.all([
      this.prisma.featureFlag.findMany({ where: { organizationId }, orderBy: { key: 'asc' } }),
      this.prisma.userFeatureFlag.findMany({ where: { userId } }),
    ]);

    const userFlagMap = new Map(userFlags.map((f) => [f.featureKey, f.state]));

    return {
      data: orgFlags.map((flag) => {
        const userState = userFlagMap.get(flag.key) ?? 'INHERIT';
        let effective: boolean;
        if (userState === 'ENABLED') effective = true;
        else if (userState === 'DISABLED') effective = false;
        else effective = flag.isEnabled;

        return {
          key: flag.key,
          name: flag.name,
          description: flag.description,
          orgEnabled: flag.isEnabled,
          userState,
          effective,
        };
      }),
    };
  }

  async setUserFlag(
    organizationId: string,
    userId: string,
    featureKey: string,
    state: string,
    updatedBy: string,
  ) {
    if (!VALID_STATES.includes(state as FeatureState)) {
      throw new BadRequestException(`state must be one of: ${VALID_STATES.join(', ')}`);
    }

    await this.ensureUserInOrg(organizationId, userId);

    // Verify the feature flag exists in the org
    const flag = await this.prisma.featureFlag.findUnique({
      where: { organizationId_key: { organizationId, key: featureKey } },
    });
    if (!flag) throw new NotFoundException(`Feature flag '${featureKey}' not found`);

    const existing = await this.prisma.userFeatureFlag.findUnique({
      where: { userId_featureKey: { userId, featureKey } },
    });

    if (state === 'INHERIT') {
      // Remove override — same as DELETE
      if (existing) {
        await this.prisma.userFeatureFlag.delete({
          where: { userId_featureKey: { userId, featureKey } },
        });
      }
      await this.auditService.log({
        organizationId,
        userId: updatedBy,
        action: 'USER_FEATURE_FLAG_RESET',
        entity: 'UserFeatureFlag',
        entityId: userId,
        oldValues: existing ? { featureKey, state: existing.state } : undefined,
        newValues: { featureKey, state: 'INHERIT' },
      });
      return { data: { featureKey, state: 'INHERIT' } };
    }

    const record = await this.prisma.userFeatureFlag.upsert({
      where: { userId_featureKey: { userId, featureKey } },
      create: {
        id: createId(),
        userId,
        featureKey,
        state,
        updatedBy,
      },
      update: { state, updatedBy },
    });

    await this.auditService.log({
      organizationId,
      userId: updatedBy,
      action: 'USER_FEATURE_FLAG_SET',
      entity: 'UserFeatureFlag',
      entityId: userId,
      oldValues: existing ? { featureKey, state: existing.state } : undefined,
      newValues: { featureKey, state },
    });

    return { data: record };
  }

  async removeUserFlag(organizationId: string, userId: string, featureKey: string, updatedBy: string) {
    await this.ensureUserInOrg(organizationId, userId);

    const existing = await this.prisma.userFeatureFlag.findUnique({
      where: { userId_featureKey: { userId, featureKey } },
    });

    if (existing) {
      await this.prisma.userFeatureFlag.delete({
        where: { userId_featureKey: { userId, featureKey } },
      });

      await this.auditService.log({
        organizationId,
        userId: updatedBy,
        action: 'USER_FEATURE_FLAG_RESET',
        entity: 'UserFeatureFlag',
        entityId: userId,
        oldValues: { featureKey, state: existing.state },
        newValues: { featureKey, state: 'INHERIT' },
      });
    }

    return { data: { message: 'User feature flag reset to inherit' } };
  }
}
