import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../communications/email.service';
import type { AuthUser } from '@knef/types';
import type { InviteUserDto } from './dto/invite-user.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { ListUsersDto } from './dto/list-users.dto';

const TEMP_PASSWORD_HASH_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async findAll(organizationId: string, dto: ListUsersDto) {
    const { page = 1, limit = 20, search, roleId, isActive } = dto;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (isActive !== undefined) where['isActive'] = isActive;
    if (search) {
      where['OR'] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (roleId) {
      where['roles'] = { some: { roleId } };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatarUrl: true,
          isActive: true,
          isEmailVerified: true,
          twoFactorEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          roles: {
            include: {
              role: { select: { id: true, name: true } },
              location: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: { select: { id: true, name: true, description: true } },
            location: { select: { id: true, name: true } },
          },
        },
        permissionOverrides: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            jobTitle: true,
            employmentType: true,
            startDate: true,
            department: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUserAdmin(organizationId: string, userId: string, data: { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string }, requestingUser: AuthUser) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      },
      select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true, updatedAt: true },
    });

    await this.auditService.log({
      organizationId,
      userId: requestingUser.id,
      action: 'USER_PROFILE_UPDATED',
      entity: 'User',
      entityId: userId,
      newValues: data,
    });

    return updated;
  }

  async invite(organizationId: string, invitedBy: AuthUser, dto: InviteUserDto) {
    // Check email uniqueness within org
    const existing = await this.prisma.user.findFirst({
      where: { organizationId, email: dto.email.toLowerCase().trim() },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists in this organization');
    }

    // Validate roles belong to org
    const roles = await this.prisma.role.findMany({
      where: { id: { in: dto.roleIds }, organizationId },
    });
    if (roles.length !== dto.roleIds.length) {
      throw new NotFoundException('One or more roles not found');
    }

    // Generate a temporary password
    const tempPassword = `Knef@${Math.random().toString(36).slice(-8)}`;
    const passwordHash = await bcrypt.hash(tempPassword, TEMP_PASSWORD_HASH_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          id: createId(),
          organizationId,
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          isActive: true,
          isEmailVerified: false,
        },
      });

      // Assign roles
      for (const roleId of dto.roleIds) {
        const locationIds = dto.locationIds ?? [null];
        for (const locationId of locationIds) {
          await tx.userRole.create({
            data: {
              id: createId(),
              userId: newUser.id,
              roleId,
              locationId: locationId ?? null,
              assignedBy: invitedBy.id,
            },
          });
        }
      }

      return newUser;
    });

    await this.auditService.log({
      organizationId,
      userId: invitedBy.id,
      action: 'USER_INVITED',
      entity: 'User',
      entityId: user.id,
      newValues: { email: dto.email, roleIds: dto.roleIds },
    });

    // TODO-PHASE1: Send invitation email with temp password
    return { ...user, tempPassword, passwordHash: undefined };
  }

  async updateProfile(userId: string, organizationId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });
  }

  async toggleActive(organizationId: string, userId: string, isActive: boolean, requestingUser: AuthUser) {
    if (userId === requestingUser.id) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });

    // Invalidate sessions if deactivating
    if (!isActive) {
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
      await this.redis.del(`perms:${userId}`);
    }

    await this.auditService.log({
      organizationId,
      userId: requestingUser.id,
      action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entity: 'User',
      entityId: userId,
      oldValues: { isActive: !isActive },
      newValues: { isActive },
    });

    return updated;
  }

  async assignRole(organizationId: string, userId: string, roleId: string, locationId: string | null) {
    const [user, role] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, organizationId } }),
      this.prisma.role.findFirst({ where: { id: roleId, organizationId } }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!role) throw new NotFoundException('Role not found');

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId_locationId: {
          userId,
          roleId,
          locationId: locationId ?? '',
        },
      },
      create: { id: createId(), userId, roleId, locationId },
      update: {},
    }).catch(async () => {
      const existing = await this.prisma.userRole.findFirst({
        where: { userId, roleId, locationId },
      });
      if (!existing) {
        await this.prisma.userRole.create({
          data: { id: createId(), userId, roleId, locationId },
        });
      }
    });

    await this.redis.del(`perms:${userId}`);

    await this.auditService.log({
      organizationId,
      action: 'USER_ROLE_ASSIGNED',
      entity: 'UserRole',
      entityId: userId,
      newValues: { userId, roleId, locationId },
    });

    return { message: 'Role assigned successfully' };
  }

  async removeRole(organizationId: string, userId: string, userRoleId: string) {
    const userRole = await this.prisma.userRole.findFirst({
      where: {
        id: userRoleId,
        userId,
        user: { organizationId },
      },
    });
    if (!userRole) throw new NotFoundException('User role assignment not found');

    await this.prisma.userRole.delete({ where: { id: userRoleId } });
    await this.redis.del(`perms:${userId}`);

    await this.auditService.log({
      organizationId,
      action: 'USER_ROLE_REMOVED',
      entity: 'UserRole',
      entityId: userRole.userId,
      oldValues: { roleId: userRole.roleId, locationId: userRole.locationId },
    });

    return { message: 'Role removed successfully' };
  }

  async sendPasswordReset(organizationId: string, userId: string, appUrl: string, requestingUser: AuthUser) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, email: true, firstName: true, isActive: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const token = randomBytes(32).toString('hex');
    const hashed = createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: { resetPasswordToken: hashed, resetPasswordExpires: expires },
    });

    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    const firstName = user.firstName ?? 'there';
    const expiryMin = 60;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Password Reset</h2>
        <p>Hi ${firstName},</p>
        <p>An admin has requested a password reset for your account. Click below to set a new password (expires in ${expiryMin} minutes):</p>
        <p><a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a></p>
        <p style="color:#666;font-size:13px">If you didn't expect this, you can safely ignore this email.</p>
      </div>`;

    await this.emailService.sendEmail({
      organizationId,
      to: user.email,
      subject: 'Reset your KNEF Business OS password',
      html,
      text: `Reset your password: ${resetUrl} (expires in ${expiryMin} minutes)`,
    });

    await this.auditService.log({
      organizationId,
      userId: requestingUser.id,
      action: 'USER_PASSWORD_RESET_SENT',
      entity: 'User',
      entityId: userId,
    });

    return { message: 'Password reset email sent' };
  }

  async deleteUser(organizationId: string, userId: string, requestingUser: AuthUser) {
    if (userId === requestingUser.id) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');

    // Invalidate all sessions first
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    await this.redis.del(`perms:${userId}`);

    // Hard delete
    await this.prisma.user.delete({ where: { id: userId } });

    await this.auditService.log({
      organizationId,
      userId: requestingUser.id,
      action: 'USER_DELETED',
      entity: 'User',
      entityId: userId,
      oldValues: { email: user.email },
    });

    return { message: 'User deleted successfully' };
  }
}
