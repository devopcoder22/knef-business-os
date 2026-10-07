import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(organizationId: string) {
    const flags = await this.prisma.featureFlag.findMany({
      where: { organizationId },
      orderBy: { key: 'asc' },
    });
    return { data: flags };
  }

  async findOne(organizationId: string, key: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    if (!flag) throw new NotFoundException(`Feature flag '${key}' not found`);
    return { data: flag };
  }

  async isEnabled(organizationId: string, key: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    return flag?.isEnabled ?? false;
  }

  async toggle(
    organizationId: string,
    key: string,
    isEnabled: boolean,
    updatedBy: string,
  ) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    if (!flag) throw new NotFoundException(`Feature flag '${key}' not found`);

    const oldEnabled = flag.isEnabled;

    const updated = await this.prisma.featureFlag.update({
      where: { organizationId_key: { organizationId, key } },
      data: { isEnabled, updatedBy },
    });

    await this.auditService.log({
      organizationId,
      userId: updatedBy,
      action: isEnabled ? 'FEATURE_FLAG_ENABLED' : 'FEATURE_FLAG_DISABLED',
      entity: 'FeatureFlag',
      entityId: flag.id,
      oldValues: { isEnabled: oldEnabled },
      newValues: { isEnabled },
    });

    return { data: updated };
  }

  async setRollout(
    organizationId: string,
    key: string,
    rolloutPercent: number,
    updatedBy: string,
  ) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    if (!flag) throw new NotFoundException(`Feature flag '${key}' not found`);

    const updated = await this.prisma.featureFlag.update({
      where: { organizationId_key: { organizationId, key } },
      data: { rolloutPercent, updatedBy },
    });

    return { data: updated };
  }
}
