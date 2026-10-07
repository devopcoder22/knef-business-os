import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, group?: string, includePrivate = false) {
    const where: Record<string, unknown> = { organizationId };
    if (group) where['group'] = group;
    if (!includePrivate) where['isPublic'] = true;

    const settings = await this.prisma.systemSetting.findMany({
      where,
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
      select: {
        id: true,
        key: true,
        value: true,
        type: true,
        group: true,
        label: true,
        description: true,
        isPublic: true,
        updatedAt: true,
      },
    });

    return { data: settings };
  }

  async findAllAdmin(organizationId: string) {
    const settings = await this.prisma.systemSetting.findMany({
      where: { organizationId },
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
    return { data: settings };
  }

  async findByKey(organizationId: string, key: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    if (!setting) throw new NotFoundException(`Setting '${key}' not found`);
    return { data: setting };
  }

  async update(organizationId: string, dto: UpdateSettingsDto, userId: string) {
    const results = await Promise.all(
      dto.settings.map(async ({ key, value }) => {
        const existing = await this.prisma.systemSetting.findUnique({
          where: { organizationId_key: { organizationId, key } },
        });
        if (!existing) {
          throw new NotFoundException(`Setting '${key}' not found`);
        }

        return this.prisma.systemSetting.update({
          where: { organizationId_key: { organizationId, key } },
          data: { value, updatedBy: userId },
        });
      }),
    );

    return { data: results };
  }

  async getValue(organizationId: string, key: string): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    return setting?.value ?? null;
  }
}
