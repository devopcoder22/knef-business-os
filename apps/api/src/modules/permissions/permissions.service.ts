import { Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditService } from '../audit/audit.service';
import { ALL_PERMISSIONS, PERMISSIONS } from '@knef/constants';

interface SetOverrideDto {
  permission: string;
  granted: boolean;
  reason?: string;
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auditService: AuditService,
  ) {}

  getRegistry() {
    return {
      data: {
        groups: PERMISSIONS,
        all: ALL_PERMISSIONS,
        total: ALL_PERMISSIONS.length,
      },
    };
  }

  async getResolvedPermissions(organizationId: string, targetUserId: string) {
    // Ensure user belongs to org
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');

    // Get roles
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: targetUserId },
      include: {
        role: {
          include: { permissions: { select: { permission: true } } },
        },
      },
    });

    const rolePerms = new Set<string>();
    const roles: string[] = [];
    for (const ur of userRoles) {
      roles.push(ur.role.name);
      for (const rp of ur.role.permissions) {
        rolePerms.add(rp.permission);
      }
    }

    // Get overrides
    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId: targetUserId },
    });

    const grantedOverrides = overrides.filter((o) => o.granted).map((o) => o.permission);
    const deniedOverrides = overrides.filter((o) => !o.granted).map((o) => o.permission);

    const finalPerms = new Set(rolePerms);
    for (const p of grantedOverrides) finalPerms.add(p);
    for (const p of deniedOverrides) finalPerms.delete(p);

    return {
      data: {
        userId: targetUserId,
        roles,
        fromRoles: Array.from(rolePerms),
        grantedOverrides,
        deniedOverrides,
        effective: Array.from(finalPerms),
      },
    };
  }

  async getUserOverrides(organizationId: string, targetUserId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');

    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId: targetUserId },
      orderBy: { permission: 'asc' },
    });

    return { data: overrides };
  }

  async setOverride(
    organizationId: string,
    targetUserId: string,
    dto: SetOverrideDto,
    grantedBy: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.userPermissionOverride.findUnique({
      where: { userId_permission: { userId: targetUserId, permission: dto.permission } },
    });

    await this.prisma.userPermissionOverride.upsert({
      where: {
        userId_permission: {
          userId: targetUserId,
          permission: dto.permission,
        },
      },
      create: {
        id: createId(),
        userId: targetUserId,
        permission: dto.permission,
        granted: dto.granted,
        reason: dto.reason,
        grantedBy,
      },
      update: {
        granted: dto.granted,
        reason: dto.reason,
        grantedBy,
      },
    });

    // Invalidate cache
    await this.redis.del(`perms:${targetUserId}`);

    await this.auditService.log({
      organizationId,
      userId: grantedBy,
      action: 'PERMISSION_OVERRIDE_SET',
      entity: 'UserPermissionOverride',
      entityId: targetUserId,
      oldValues: existing ? { granted: existing.granted } : undefined,
      newValues: { permission: dto.permission, granted: dto.granted, reason: dto.reason },
    });

    return { data: { message: 'Permission override set successfully' } };
  }

  async removeOverride(
    organizationId: string,
    targetUserId: string,
    permission: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.userPermissionOverride.findUnique({
      where: { userId_permission: { userId: targetUserId, permission } },
    });

    await this.prisma.userPermissionOverride.deleteMany({
      where: { userId: targetUserId, permission },
    });

    await this.redis.del(`perms:${targetUserId}`);

    if (existing) {
      await this.auditService.log({
        organizationId,
        action: 'PERMISSION_OVERRIDE_REMOVED',
        entity: 'UserPermissionOverride',
        entityId: targetUserId,
        oldValues: { permission, granted: existing.granted },
      });
    }

    return { data: { message: 'Permission override removed' } };
  }
}
