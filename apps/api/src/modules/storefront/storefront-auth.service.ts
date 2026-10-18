import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createId } from '@paralleldrive/cuid2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import type { CustomerRegisterDto } from './dto/customer-register.dto';
import type { CustomerLoginDto } from './dto/customer-login.dto';

const BCRYPT_ROUNDS = 12;
const LOCKOUT_MAX = 5;
const LOCKOUT_TTL = 15 * 60;
const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_DAYS = 30;

@Injectable()
export class StorefrontAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async register(organizationId: string, dto: CustomerRegisterDto) {
    const existing = await this.prisma.customerAccount.findFirst({
      where: { organizationId, email: dto.email.toLowerCase().trim() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Find or create CRM Customer record
    let customer = dto.phone
      ? await this.prisma.customer.findFirst({
          where: { organizationId, phone: dto.phone },
        })
      : null;

    if (!customer) {
      customer = await this.prisma.customer.findFirst({
        where: { organizationId, email: dto.email.toLowerCase().trim() },
      });
    }

    if (!customer) {
      const code = `WEB-${Date.now()}`;
      customer = await this.prisma.customer.create({
        data: {
          id: createId(),
          organizationId,
          code,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email.toLowerCase().trim(),
          phone: dto.phone ?? `WEB-${Date.now()}`,
        },
      });
    }

    const account = await this.prisma.customerAccount.create({
      data: {
        id: createId(),
        organizationId,
        customerId: customer.id,
        email: dto.email.toLowerCase().trim(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        passwordHash,
      },
    });

    const tokens = await this.generateTokenPair(account.id, organizationId, account.email);
    return {
      ...tokens,
      customer: {
        id: account.id,
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
      },
    };
  }

  async login(organizationId: string, dto: CustomerLoginDto) {
    const account = await this.prisma.customerAccount.findFirst({
      where: { organizationId, email: dto.email.toLowerCase().trim(), isActive: true },
    });

    if (!account) throw new UnauthorizedException('Invalid email or password');

    const lockKey = `customer-lockout:${account.id}`;
    const attempts = await this.redis.get(lockKey);
    if (attempts && parseInt(attempts, 10) >= LOCKOUT_MAX) {
      throw new UnauthorizedException(
        'Account locked due to too many failed attempts. Try again in 15 minutes.',
      );
    }

    const valid = await bcrypt.compare(dto.password, account.passwordHash);
    if (!valid) {
      const n = await this.redis.incr(lockKey);
      await this.redis.expire(lockKey, LOCKOUT_TTL);
      if (n >= LOCKOUT_MAX) {
        throw new UnauthorizedException('Account locked due to too many failed attempts.');
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.redis.del(lockKey);
    await this.prisma.customerAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokenPair(account.id, organizationId, account.email);
    return {
      ...tokens,
      customer: {
        id: account.id,
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
      },
    };
  }

  async refresh(rawRefreshToken: string) {
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const stored = await this.prisma.customerAccountRefreshToken.findFirst({
      where: { tokenHash },
      include: { customerAccount: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.customerAccountRefreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    if (!stored.customerAccount.isActive) {
      throw new UnauthorizedException('Account inactive');
    }

    await this.prisma.customerAccountRefreshToken.delete({ where: { id: stored.id } });
    const tokens = await this.generateTokenPair(
      stored.customerAccount.id,
      stored.customerAccount.organizationId,
      stored.customerAccount.email,
    );
    return tokens;
  }

  async getProfile(accountId: string) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isVerified: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async postOrderRegister(
    organizationId: string,
    dto: {
      orderReference: string;
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
    },
  ) {
    // 1. Find order by reference
    const order = await this.prisma.salesOrder.findFirst({
      where: { organizationId, reference: dto.orderReference },
      include: { customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // 2. Verify email matches the order customer
    if (!order.customer?.email || order.customer.email.toLowerCase() !== dto.email.toLowerCase()) {
      throw new BadRequestException('Email does not match order');
    }

    // 3. Check no existing CustomerAccount with same email
    const existing = await this.prisma.customerAccount.findFirst({
      where: { organizationId, email: dto.email.toLowerCase().trim() },
    });
    if (existing) throw new ConflictException('Email already registered');

    // 4. Hash password and create account
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const account = await this.prisma.customerAccount.create({
      data: {
        id: createId(),
        organizationId,
        email: dto.email.toLowerCase().trim(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        passwordHash,
        customerId: order.customerId ?? undefined,
      },
    });

    // 5. Link order to the new account
    await this.prisma.salesOrder.update({
      where: { id: order.id },
      data: { customerAccountId: account.id },
    });

    // 6. If order has existing customerId, link to account (already set above in create, but ensure)
    if (order.customerId) {
      await this.prisma.customerAccount.update({
        where: { id: account.id },
        data: { customerId: order.customerId },
      });
    }

    const tokens = await this.generateTokenPair(account.id, organizationId, account.email);
    return {
      ...tokens,
      customer: {
        id: account.id,
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
      },
    };
  }

  async logout(accountId: string, rawRefreshToken: string) {
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    await this.prisma.customerAccountRefreshToken.deleteMany({
      where: { customerAccountId: accountId, tokenHash },
    });
  }

  private async generateTokenPair(accountId: string, orgId: string, email: string) {
    const payload = { sub: accountId, orgId, email, type: 'customer' };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn: ACCESS_TOKEN_EXPIRES,
    });

    const rawRefresh = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawRefresh).digest('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.customerAccountRefreshToken.create({
      data: {
        id: createId(),
        customerAccountId: accountId,
        tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefresh };
  }
}
