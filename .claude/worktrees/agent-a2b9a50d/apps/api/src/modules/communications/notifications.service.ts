import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';

interface CreateNotificationParams {
  organizationId: string;
  userId?: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(params: CreateNotificationParams): Promise<void> {
    await this.prisma.notification.create({
      data: {
        id: createId(),
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        type: params.type,
        title: params.title,
        body: params.body,
        data: (params.data ?? {}) as Prisma.InputJsonValue,
        channel: params.channel,
        isRead: false,
      },
    });
  }

  async findUserNotifications(
    organizationId: string,
    userId: string,
    options: { isRead?: boolean; type?: string; page?: number; limit?: number },
  ) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId, userId };
    if (options.isRead !== undefined) where.isRead = options.isRead;
    if (options.type) where.type = options.type;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async markAsRead(organizationId: string, userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId, userId },
    });
    if (!notification) {
      throw new Error('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(organizationId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { organizationId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async getUnreadCount(organizationId: string, userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { organizationId, userId, isRead: false },
    });
    return { count };
  }
}
