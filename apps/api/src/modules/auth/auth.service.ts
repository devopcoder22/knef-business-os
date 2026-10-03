import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { hashToken, generateSecureToken } from '@knef/utils';
import type { JwtPayload, AuthUser, LoginResponse, RefreshResponse } from '@knef/types';
import { EVENTS } from '@knef/constants';
import type { RegisterDto } from './dto/register.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_TTL_SECONDS = 15 * 60; // 15 minutes
const PERMISSIONS_CACHE_TTL = 300; // 5 minutes
const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_EXPIRES_MINUTES = 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Validate local strategy ────────────────────────────────────────────────

  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<AuthUser | null> {
    // Find user across all orgs by email (email is unique per org, so we find first match)
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true },
    });

    if (!user) return null;

    // Check lockout
    const lockoutKey = `lockout:${user.id}`;
    const attempts = await this.redis.get(lockoutKey);
    if (attempts && parseInt(attempts, 10) >= LOCKOUT_MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        'Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      const newAttempts = await this.redis.incr(lockoutKey);
      await this.redis.expire(lockoutKey, LOCKOUT_TTL_SECONDS);
      this.logger.warn(`Failed login attempt ${newAttempts} for ${email}`);

      if (newAttempts >= LOCKOUT_MAX_ATTEMPTS) {
        this.eventEmitter.emit(EVENTS.USER.LOCKED, { userId: user.id, email });
      }
      return null;
    }

    // Clear lockout on success
    await this.redis.del(lockoutKey);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.buildAuthUser(user.id, user.organizationId, user.email, user.firstName, user.lastName);
  }

  // ─── JWT validation ─────────────────────────────────────────────────────────

  async getUserFromJwt(payload: JwtPayload): Promise<AuthUser | null> {
    const cacheKey = `perms:${payload.sub}`;
    const cached = await this.redis.getJson<AuthUser>(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true, organizationId: payload.orgId },
    });

    if (!user) return null;

    const authUser = await this.buildAuthUser(
      user.id,
      user.organizationId,
      user.email,
      user.firstName,
      user.lastName,
    );

    await this.redis.setJson(cacheKey, authUser, PERMISSIONS_CACHE_TTL);
    return authUser;
  }

  // ─── Build AuthUser with resolved permissions ────────────────────────────────

  private async buildAuthUser(
    userId: string,
    organizationId: string,
    email: string,
    firstName: string,
    lastName: string,
  ): Promise<AuthUser> {
    // Get roles
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { permissions: true },
        },
      },
    });

    const roles = [...new Set(userRoles.map((ur) => ur.role.name))];
    const locationIds = userRoles
      .filter((ur) => ur.locationId !== null)
      .map((ur) => ur.locationId as string);

    // Merge role permissions
    const rolePerms = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.permissions) {
        rolePerms.add(rp.permission);
      }
    }

    // Get user permission overrides
    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId },
    });

    // Apply overrides: granted = add, denied = remove
    const finalPerms = new Set(rolePerms);
    for (const override of overrides) {
      if (override.granted) {
        finalPerms.add(override.permission);
      } else {
        finalPerms.delete(override.permission);
      }
    }

    return {
      id: userId,
      organizationId,
      email,
      firstName,
      lastName,
      roles,
      permissions: Array.from(finalPerms),
      locationIds: locationIds.length > 0 ? locationIds : null,
    };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(user: AuthUser, rememberMe = false): Promise<LoginResponse & { refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      orgId: user.organizationId,
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = generateSecureToken(48);
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (rememberMe ? 60 : 30));

    await this.prisma.refreshToken.create({
      data: {
        id: createId(),
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    this.eventEmitter.emit(EVENTS.USER.LOGIN, { userId: user.id, email: user.email });

    return {
      user,
      accessToken,
      expiresIn: 15 * 60,
      refreshToken,
    };
  }

  // ─── Refresh token ──────────────────────────────────────────────────────────

  async refreshTokens(rawToken: string): Promise<RefreshResponse & { refreshToken: string }> {
    const tokenHash = hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: delete old, create new
    await this.prisma.refreshToken.delete({ where: { tokenHash } });

    const newRawToken = generateSecureToken(48);
    const newTokenHash = hashToken(newRawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.refreshToken.create({
      data: {
        id: createId(),
        userId: stored.userId,
        tokenHash: newTokenHash,
        expiresAt,
      },
    });

    const payload: JwtPayload = {
      sub: stored.user.id,
      orgId: stored.user.organizationId,
      email: stored.user.email,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    });

    return {
      accessToken,
      expiresIn: 15 * 60,
      refreshToken: newRawToken,
    };
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.prisma.refreshToken
      .delete({ where: { tokenHash } })
      .catch(() => {}); // Ignore if already deleted
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    await this.redis.del(`perms:${userId}`);
  }

  // ─── Register ───────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<LoginResponse & { refreshToken: string }> {
    // Check email not already in use
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const slug = dto.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check org slug
    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug },
    });

    const finalSlug = existingOrg ? `${slug}-${Date.now()}` : slug;

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Create org + user in transaction
    const { user, superAdminRole } = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          id: createId(),
          name: dto.organizationName,
          slug: finalSlug,
          currency: 'NGN',
          timezone: 'Africa/Lagos',
        },
      });

      const newUser = await tx.user.create({
        data: {
          id: createId(),
          organizationId: org.id,
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          isActive: true,
          isEmailVerified: false,
        },
      });

      // Create SUPER_ADMIN role for new org
      const role = await tx.role.create({
        data: {
          id: createId(),
          organizationId: org.id,
          name: 'SUPER_ADMIN',
          description: 'Full system access. All permissions.',
          isSystem: true,
        },
      });

      return { user: newUser, superAdminRole: role };
    });

    const authUser = await this.buildAuthUser(
      user.id,
      user.organizationId,
      user.email,
      user.firstName,
      user.lastName,
    );

    this.eventEmitter.emit(EVENTS.USER.CREATED, { userId: user.id });
    return this.login(authUser);
  }

  // ─── Forgot password ─────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true },
    });

    // Always return success to prevent user enumeration
    if (!user) return;

    const token = generateSecureToken(32);
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + RESET_TOKEN_EXPIRES_MINUTES);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashToken(token),
        resetPasswordExpires: expires,
      },
    });

    this.eventEmitter.emit(EVENTS.USER.PASSWORD_RESET_REQUESTED, {
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName ?? null,
      token, // plaintext — used by listener to construct the reset URL
      expires,
    });
  }

  // ─── Reset password ──────────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashToken(dto.token);

    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: tokenHash,
        resetPasswordExpires: { gt: new Date() },
        isActive: true,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        passwordChangedAt: new Date(),
      },
    });

    // Invalidate all refresh tokens and permissions cache
    await this.logoutAll(user.id);
    this.eventEmitter.emit(EVENTS.USER.PASSWORD_CHANGED, { userId: user.id });
  }

  // ─── Change password ─────────────────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    await this.logoutAll(userId);
    this.eventEmitter.emit(EVENTS.USER.PASSWORD_CHANGED, { userId });
  }

  // ─── 2FA Setup ───────────────────────────────────────────────────────────────

  async setup2fa(userId: string): Promise<{ secret: string; qrCodeUrl: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { organization: { select: { name: true } } },
    });

    const secret = speakeasy.generateSecret({
      name: `KNEF OS (${user.email})`,
      issuer: user.organization.name,
      length: 32,
    });

    // Store unverified secret
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    const otpauthUrl = secret.otpauth_url ?? '';
    const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);

    return {
      secret: secret.base32,
      qrCodeUrl,
      otpauthUrl,
    };
  }

  // ─── 2FA Enable ──────────────────────────────────────────────────────────────

  async enable2fa(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.twoFactorSecret) {
      throw new BadRequestException('2FA setup not initiated. Call /auth/2fa/setup first.');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  // ─── 2FA Disable ─────────────────────────────────────────────────────────────

  async disable2fa(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA is not enabled');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  }

  // ─── Profile ─────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return this.buildAuthUser(user.id, user.organizationId, user.email, user.firstName, user.lastName);
  }

  // ─── Invalidate permissions cache ────────────────────────────────────────────

  async invalidatePermissionsCache(userId: string): Promise<void> {
    await this.redis.del(`perms:${userId}`);
  }
}
