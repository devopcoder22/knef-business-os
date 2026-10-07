import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { RedisService } from '../../common/services/redis.service';
import { PrismaService } from '../../common/services/prisma.service';
import { createId } from '@paralleldrive/cuid2';

const LINK_CODE_TTL = 600; // 10 minutes
const LINK_CODE_PREFIX = 'telegram:link:';

interface LinkCodePayload {
  userId: string;
  organizationId: string;
}

@Injectable()
export class TelegramLinkingService {
  private readonly logger = new Logger(TelegramLinkingService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async generateLinkCode(userId: string, organizationId: string): Promise<string> {
    // Remove any existing code for this user first (single active code per user)
    const existing = await this.redis.get(`telegram:link:user:${userId}`);
    if (existing) {
      await this.redis.del(`${LINK_CODE_PREFIX}${existing}`);
      await this.redis.del(`telegram:link:user:${userId}`);
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const payload: LinkCodePayload = { userId, organizationId };
    await this.redis.setJson(`${LINK_CODE_PREFIX}${code}`, payload, LINK_CODE_TTL);
    // Reverse index so we can clean up old codes when generating a new one
    await this.redis.set(`telegram:link:user:${userId}`, code, LINK_CODE_TTL);
    return code;
  }

  async consumeLinkCode(code: string): Promise<LinkCodePayload | null> {
    const payload = await this.redis.getJson<LinkCodePayload>(`${LINK_CODE_PREFIX}${code}`);
    if (!payload) return null;
    // Single-use: delete immediately
    await this.redis.del(`${LINK_CODE_PREFIX}${code}`);
    await this.redis.del(`telegram:link:user:${payload.userId}`);
    return payload;
  }

  async linkAccount(
    payload: LinkCodePayload,
    telegramId: string,
    telegramUsername: string | undefined,
    telegramChatId: string,
  ): Promise<void> {
    // Check if this telegramId is already linked to a different user in this org
    const existingLink = await this.prisma.telegramUserLink.findFirst({
      where: {
        organizationId: payload.organizationId,
        telegramId,
        userId: { not: payload.userId },
      },
    });
    if (existingLink) {
      throw new BadRequestException(
        'This Telegram account is already linked to a different user in this organization.',
      );
    }

    await this.prisma.telegramUserLink.upsert({
      where: {
        organizationId_userId: {
          organizationId: payload.organizationId,
          userId: payload.userId,
        },
      },
      create: {
        id: createId(),
        organizationId: payload.organizationId,
        userId: payload.userId,
        telegramId,
        telegramUsername,
        telegramChatId,
        isVerified: true,
        verifiedAt: new Date(),
      } as never,
      update: {
        telegramId,
        telegramUsername,
        telegramChatId,
        isVerified: true,
        verifiedAt: new Date(),
      } as never,
    });

    this.logger.log(
      `Telegram linked: userId=${payload.userId} telegramId=${telegramId} orgId=${payload.organizationId}`,
    );
  }

  async unlinkAccount(organizationId: string, userId: string): Promise<void> {
    await this.prisma.telegramUserLink.deleteMany({
      where: { organizationId, userId },
    });
  }

  async getLinkedUser(organizationId: string, telegramId: string) {
    return this.prisma.telegramUserLink.findFirst({
      where: { organizationId, telegramId, isVerified: true },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      } as never,
    });
  }

  async getLinkedUsers(organizationId: string) {
    return this.prisma.telegramUserLink.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUserPreferences(
    organizationId: string,
    userId: string,
    prefs: {
      notifyOrders?: boolean;
      notifyInventory?: boolean;
      notifyFinance?: boolean;
      notifyTasks?: boolean;
      notifyLowStock?: boolean;
      notifyTargets?: boolean;
    },
  ): Promise<void> {
    await this.prisma.telegramUserLink.updateMany({
      where: { organizationId, userId },
      data: prefs,
    });
  }
}
