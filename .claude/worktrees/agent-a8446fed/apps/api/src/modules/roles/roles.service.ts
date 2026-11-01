import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(organizationId: string) {
    return this.prisma.role.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { permissions: true, userRoles: true } },
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, organizationId },
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(organizationId: string, dto: CreateRoleDto) {
    const existing = await this.prisma.role.findFirst({
      where: { organizationId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException(`Role '${dto.name}' already exists`);

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          id: createId(),
          organizationId,
          name: dto.name.toUpperCase().replace(/\s+/g, '_'),
          description: dto.description,
          isSystem: false,
        },
      });

      if (dto.permissions && dto.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissions.map((p) => ({
            id: createId(),
            roleId: role.id,
            permission: p,
          })),
          skipDuplicates: true,
        });
      }

      return role;
    });
  }

  async update(organizationId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(organizationId, id);

    await this.prisma.$transaction(async (tx) => {
      if (dto.description !== undefined) {
        await tx.role.update({
          where: { id },
          data: { description: dto.description },
        });
      }

      if (dto.permissions !== undefined) {
        // Replace all permissions
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (dto.permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: dto.permissions.map((p) => ({
              id: createId(),
              roleId: id,
              permission: p,
            })),
            skipDuplicates: true,
          });
        }

        // Invalidate cached permissions for all users with this role
        const userRoles = await tx.userRole.findMany({ where: { roleId: id } });
        for (const ur of userRoles) {
          await this.redis.del(`perms:${ur.userId}`);
        }
      }
    });

    return this.findOne(organizationId, id);
  }

  async addPermissions(organizationId: string, id: string, permissions: string[]) {
    await this.findOne(organizationId, id);

    await this.prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ id: createId(), roleId: id, permission: p })),
      skipDuplicates: true,
    });

    await this.invalidateRoleUsersCache(id);
    return this.findOne(organizationId, id);
  }

  async removePermissions(organizationId: string, id: string, permissions: string[]) {
    await this.findOne(organizationId, id);

    await this.prisma.rolePermission.deleteMany({
      where: { roleId: id, permission: { in: permissions } },
    });

    await this.invalidateRoleUsersCache(id);
    return this.findOne(organizationId, id);
  }

  async clone(organizationId: string, sourceId: string, newName: string) {
    const source = await this.findOne(organizationId, sourceId);

    const existing = await this.prisma.role.findFirst({
      where: { organizationId, name: { equals: newName, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException(`Role '${newName}' already exists`);

    return this.prisma.$transaction(async (tx) => {
      const newRole = await tx.role.create({
        data: {
          id: createId(),
          organizationId,
          name: newName.toUpperCase().replace(/\s+/g, '_'),
          description: `Cloned from ${source.name}`,
          isSystem: false,
        },
      });

      const perms = source.permissions.map((p) => p.permission);
      if (perms.length > 0) {
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ id: createId(), roleId: newRole.id, permission: p })),
          skipDuplicates: true,
        });
      }

      return newRole;
    });
  }

  async remove(organizationId: string, id: string) {
    const role = await this.findOne(organizationId, id);
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted');
    }

    // Check if any users have this role
    const userCount = await this.prisma.userRole.count({ where: { roleId: id } });
    if (userCount > 0) {
      throw new ConflictException(
        `Cannot delete role: ${userCount} user(s) still have this role assigned`,
      );
    }

    await this.prisma.role.delete({ where: { id } });
    return { message: 'Role deleted successfully' };
  }

  private async invalidateRoleUsersCache(roleId: string): Promise<void> {
    const userRoles = await this.prisma.userRole.findMany({ where: { roleId } });
    await Promise.all(userRoles.map((ur) => this.redis.del(`perms:${ur.userId}`)));
  }
}
