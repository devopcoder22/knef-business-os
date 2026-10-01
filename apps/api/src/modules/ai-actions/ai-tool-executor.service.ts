import { Injectable, BadRequestException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type { AITool, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { NotificationsService } from '../communications/notifications.service';
import { NotificationType } from '@prisma/client';

interface PurchaseOrderItem {
  productId: string;
  quantity: number;
  unitCost: number;
}

@Injectable()
export class AIToolExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async execute(
    tool: AITool,
    parameters: Record<string, unknown>,
    orgId: string,
  ): Promise<unknown> {
    switch (tool.name) {
      case 'get_inventory_levels':
        return this.getInventoryLevels(orgId, parameters);
      case 'get_sales_summary':
        return this.getSalesSummary(orgId, parameters);
      case 'get_low_stock_products':
        return this.getLowStockProducts(orgId);
      case 'create_purchase_order':
        return this.createPurchaseOrder(orgId, parameters);
      case 'send_notification':
        return this.sendNotification(orgId, parameters);
      case 'get_financial_summary':
        return this.getFinancialSummary(orgId, parameters);
      case 'get_orders':
        return this.getOrders(orgId, parameters);
      case 'get_tasks':
        return this.getTasks(orgId, parameters);
      case 'create_task':
        return this.createTask(orgId, parameters);
      case 'get_goals':
        return this.getGoals(orgId, parameters);
      case 'get_calendar_events':
        return this.getCalendarEvents(orgId, parameters);
      default:
        throw new BadRequestException(`Unknown tool: ${tool.name}`);
    }
  }

  private async getInventoryLevels(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const where: Record<string, unknown> = {};

    if (params.productId && typeof params.productId === 'string') {
      where.productId = params.productId;
      const product = await this.prisma.product.findFirst({
        where: { id: params.productId, organizationId: orgId },
      });
      if (!product) {
        return { levels: [], message: 'Product not found' };
      }
    } else {
      const orgProducts = await this.prisma.product.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      });
      where.productId = { in: orgProducts.map((p) => p.id) };
    }

    if (params.locationId && typeof params.locationId === 'string') {
      where.locationId = params.locationId;
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, lowStockAlert: true } },
        location: { select: { id: true, name: true } },
      },
    });

    return { levels };
  }

  private async getSalesSummary(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<{ totalRevenue: string; totalOrders: number }> {
    const startDate = params.startDate ? new Date(params.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = params.endDate ? new Date(params.endDate as string) : new Date();

    const orders = await this.prisma.salesOrder.findMany({
      where: {
        organizationId: orgId,
        status: 'COMPLETED',
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { totalAmount: true },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    return {
      totalRevenue: totalRevenue.toFixed(2),
      totalOrders: orders.length,
    };
  }

  private async getLowStockProducts(orgId: string): Promise<unknown> {
    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId, trackInventory: true },
      select: {
        id: true,
        name: true,
        sku: true,
        lowStockAlert: true,
        inventoryLevels: {
          select: { quantity: true, location: { select: { name: true } } },
        },
      },
    });

    const lowStock = products.filter((p) => {
      const total = p.inventoryLevels.reduce((s, l) => s + l.quantity, 0);
      return total <= p.lowStockAlert;
    });

    return {
      lowStockProducts: lowStock.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        threshold: p.lowStockAlert,
        totalQuantity: p.inventoryLevels.reduce((s, l) => s + l.quantity, 0),
        levels: p.inventoryLevels,
      })),
      count: lowStock.length,
    };
  }

  private async createPurchaseOrder(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const supplierId = params.supplierId as string;
    const locationId = params.locationId as string;
    const rawItems = (params.items ?? []) as PurchaseOrderItem[];

    if (!supplierId || !locationId) {
      throw new BadRequestException('supplierId and locationId are required');
    }

    const reference = `PO-AI-${Date.now()}`;
    const items = rawItems.map((item) => ({
      id: createId(),
      productId: item.productId,
      quantity: item.quantity,
      receivedQty: 0,
      unitCost: item.unitCost,
      taxRate: 0,
      discountRate: 0,
      totalCost: item.quantity * item.unitCost,
    }));

    const subtotal = items.reduce((s, i) => s + i.totalCost, 0);

    const po = await this.prisma.purchaseOrder.create({
      data: {
        id: createId(),
        organizationId: orgId,
        reference,
        supplierId,
        locationId,
        status: 'DRAFT',
        currency: 'NGN',
        subtotal,
        taxAmount: 0,
        shippingCost: 0,
        discountAmount: 0,
        totalAmount: subtotal,
        paidAmount: 0,
        items: {
          create: items,
        },
      },
      select: { id: true, reference: true, status: true, totalAmount: true },
    });

    return { purchaseOrder: { ...po, totalAmount: po.totalAmount.toString() } };
  }

  private async sendNotification(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<{ sent: boolean }> {
    const title = (params.title as string) ?? 'AI Notification';
    const body = (params.body as string) ?? '';
    const userId = params.userId as string | undefined;
    const type = (params.type as NotificationType) ?? NotificationType.INFO;

    await this.notifications.createNotification({
      organizationId: orgId,
      userId,
      type,
      title,
      body,
    });

    return { sent: true };
  }

  private async getFinancialSummary(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<{ revenue: string; expenses: string; profit: string }> {
    const now = new Date();
    const monthStart = params.month
      ? new Date(params.month as string)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const [orders, expenseRows] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: {
          organizationId: orgId,
          status: 'COMPLETED',
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        select: { totalAmount: true },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId: orgId,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        select: { amount: true },
      }),
    ]);

    const revenue = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    const expenses = expenseRows.reduce((s, e) => s + Number(e.amount), 0);
    const profit = revenue - expenses;

    return {
      revenue: revenue.toFixed(2),
      expenses: expenses.toFixed(2),
      profit: profit.toFixed(2),
    };
  }

  private async getOrders(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const limit = Math.min(Number(params.limit ?? 20), 50);
    const where: Record<string, unknown> = { organizationId: orgId };
    if (params.status && typeof params.status === 'string') {
      where.status = params.status;
    }

    const orders = await this.prisma.salesOrder.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        status: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return {
      orders: orders.map((o) => ({
        ...o,
        totalAmount: o.totalAmount.toString(),
      })),
      count: orders.length,
    };
  }

  private async getTasks(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const limit = Math.min(Number(params.limit ?? 20), 50);
    const where: Record<string, unknown> = { organizationId: orgId };
    if (params.status && typeof params.status === 'string') {
      where.status = params.status as TaskStatus;
    }
    if (params.priority && typeof params.priority === 'string') {
      where.priority = params.priority as TaskPriority;
    }

    const tasks = await this.prisma.task.findMany({
      where,
      take: limit,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return { tasks, count: tasks.length };
  }

  private async createTask(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const title = params.title as string;
    if (!title) throw new BadRequestException('title is required');

    // Use the first user in the org as creator for agent-initiated tasks
    const firstUser = await this.prisma.user.findFirst({
      where: { organizationId: orgId },
      select: { id: true },
    });
    if (!firstUser) throw new BadRequestException('No users found in organization');
    const creatorId = firstUser.id;

    const task = await this.prisma.task.create({
      data: {
        id: createId(),
        organizationId: orgId,
        title,
        description: params.description as string | undefined,
        priority: (params.priority as TaskPriority | undefined) ?? 'MEDIUM',
        dueDate: params.dueDate ? new Date(params.dueDate as string) : undefined,
        creatorId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
      },
    });

    return { task };
  }

  private async getGoals(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const limit = Math.min(Number(params.limit ?? 20), 20);
    const where: Record<string, unknown> = { organizationId: orgId };
    if (params.status && typeof params.status === 'string') {
      where.status = params.status;
    }

    const goals = await this.prisma.goal.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        progress: true,
        startDate: true,
        endDate: true,
        kpis: {
          select: { id: true, name: true, target: true, current: true, unit: true },
        },
      },
    });

    return {
      goals: goals.map((g) => ({
        ...g,
        kpis: g.kpis.map((k) => ({
          ...k,
          target: k.target.toString(),
          current: k.current.toString(),
        })),
      })),
      count: goals.length,
    };
  }

  private async getCalendarEvents(
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const limit = Math.min(Number(params.limit ?? 20), 50);
    const startAt = params.startDate ? new Date(params.startDate as string) : new Date();
    const endAt = params.endDate
      ? new Date(params.endDate as string)
      : new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        organizationId: orgId,
        startAt: { gte: startAt },
        endAt: { lte: endAt },
      },
      take: limit,
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        startAt: true,
        endAt: true,
        timezone: true,
        isAllDay: true,
        status: true,
      },
    });

    return { events, count: events.length };
  }
}
