import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

export interface CommandResult {
  text: string;
}

@Injectable()
export class TelegramCommandService {
  constructor(private readonly prisma: PrismaService) {}

  async handleSales(organizationId: string, locationIds?: string[] | null): Promise<CommandResult> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const [todayOrders, weekOrders] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: {
          organizationId,
          createdAt: { gte: todayStart },
          ...(locationIds != null ? { locationId: { in: locationIds } } : {}),
        },
        select: { totalAmount: true, status: true },
      }),
      this.prisma.salesOrder.findMany({
        where: {
          organizationId,
          createdAt: { gte: weekStart },
          ...(locationIds != null ? { locationId: { in: locationIds } } : {}),
        },
        select: { totalAmount: true, status: true },
      }),
    ]);

    const todayRevenue = todayOrders
      .filter((o) => o.status === 'COMPLETED')
      .reduce((s, o) => s + Number(o.totalAmount), 0);
    const weekRevenue = weekOrders
      .filter((o) => o.status === 'COMPLETED')
      .reduce((s, o) => s + Number(o.totalAmount), 0);

    return {
      text:
        `📊 <b>Sales Summary</b>\n\n` +
        `<b>Today</b>\n` +
        `• Orders: ${todayOrders.length}\n` +
        `• Revenue: ₦${todayRevenue.toLocaleString('en-NG', { minimumFractionDigits: 2 })}\n\n` +
        `<b>Last 7 Days</b>\n` +
        `• Orders: ${weekOrders.length}\n` +
        `• Revenue: ₦${weekRevenue.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
    };
  }

  async handleInventory(organizationId: string, locationIds?: string[] | null): Promise<CommandResult> {
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        trackInventory: true,
        status: { not: 'DISCONTINUED' },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        lowStockAlert: true,
        inventoryLevels: {
          where: locationIds != null ? { locationId: { in: locationIds } } : undefined,
          select: { quantity: true },
        },
      },
    });

    const lowStock = products.filter((p) => {
      const total = p.inventoryLevels.reduce((s: number, l: { quantity: number }) => s + l.quantity, 0);
      return total <= p.lowStockAlert;
    });

    const lines = lowStock
      .slice(0, 5)
      .map((p) => {
        const qty = p.inventoryLevels.reduce((s: number, l: { quantity: number }) => s + l.quantity, 0);
        return `• ${p.name} (${p.sku}) — ${qty} left`;
      })
      .join('\n');

    const extra = lowStock.length > 5 ? `\n...and ${lowStock.length - 5} more` : '';

    return {
      text:
        `📦 <b>Inventory Alert</b>\n\n` +
        `<b>${lowStock.length}</b> product(s) at or below reorder point\n` +
        (lowStock.length > 0 ? `\n${lines}${extra}` : ''),
    };
  }

  async handleProfit(organizationId: string): Promise<CommandResult> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [orders, expenses] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: {
          organizationId,
          status: 'COMPLETED',
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        select: { totalAmount: true },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        select: { amount: true },
      }),
    ]);

    const revenue = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const profit = revenue - expenseTotal;
    const month = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });

    return {
      text:
        `💰 <b>Financial Summary — ${month}</b>\n\n` +
        `• Revenue: ₦${revenue.toLocaleString('en-NG', { minimumFractionDigits: 2 })}\n` +
        `• Expenses: ₦${expenseTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}\n` +
        `• <b>Profit: ₦${profit.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</b>`,
    };
  }

  async handleTasks(organizationId: string, userId: string): Promise<CommandResult> {
    const now = new Date();
    const [open, overdue] = await Promise.all([
      this.prisma.task.count({
        where: {
          organizationId,
          status: { notIn: ['DONE', 'CANCELLED'] },
          assigneeId: userId,
        },
      }),
      this.prisma.task.count({
        where: {
          organizationId,
          status: { notIn: ['DONE', 'CANCELLED'] },
          assigneeId: userId,
          dueDate: { lt: now },
        },
      }),
    ]);

    return {
      text:
        `✅ <b>Your Tasks</b>\n\n` +
        `• Open: ${open}\n` +
        `• Overdue: ${overdue}`,
    };
  }

  async handleOrders(organizationId: string): Promise<CommandResult> {
    const [pendingSales, pendingPurchasing] = await Promise.all([
      this.prisma.salesOrder.count({
        where: { organizationId, status: { in: ['CONFIRMED', 'PROCESSING'] } },
      }),
      this.prisma.purchaseOrder.count({
        where: { organizationId, status: { in: ['DRAFT', 'SUBMITTED'] } },
      }),
    ]);

    return {
      text:
        `🛒 <b>Orders</b>\n\n` +
        `• Pending sales orders: ${pendingSales}\n` +
        `• Open purchase orders: ${pendingPurchasing}`,
    };
  }

  async handleTargets(organizationId: string): Promise<CommandResult> {
    const goals = await this.prisma.goal.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: { title: true, progress: true },
      take: 5,
      orderBy: { updatedAt: 'desc' },
    });

    if (goals.length === 0) {
      return { text: '🎯 <b>Goals</b>\n\nNo active goals set.' };
    }

    const lines = goals
      .map((g) => {
        const pct = Math.min(g.progress, 100);
        const filled = Math.floor(pct / 10);
        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
        return `• ${g.title}\n  ${bar} ${pct}%`;
      })
      .join('\n\n');

    return { text: `🎯 <b>Goals Progress</b>\n\n${lines}` };
  }

  async handleDaily(organizationId: string, userId: string, locationIds?: string[] | null): Promise<CommandResult> {
    const [sales, inventory, profit, tasks, orders] = await Promise.all([
      this.handleSales(organizationId, locationIds),
      this.handleInventory(organizationId, locationIds),
      this.handleProfit(organizationId),
      this.handleTasks(organizationId, userId),
      this.handleOrders(organizationId),
    ]);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return {
      text:
        `📋 <b>Daily Digest — ${dateStr}</b>\n\n` +
        `${sales.text}\n\n` +
        `─────────────────\n\n` +
        `${inventory.text}\n\n` +
        `─────────────────\n\n` +
        `${profit.text}\n\n` +
        `─────────────────\n\n` +
        `${tasks.text}\n\n` +
        `─────────────────\n\n` +
        `${orders.text}`,
    };
  }

  getHelpText(): CommandResult {
    return {
      text:
        `🤖 <b>KNEF Business OS Bot</b>\n\n` +
        `Available commands:\n\n` +
        `/sales — Today's and 7-day sales summary\n` +
        `/inventory — Low stock alerts\n` +
        `/profit — This month's P&L\n` +
        `/tasks — Your open and overdue tasks\n` +
        `/orders — Pending orders overview\n` +
        `/targets — Goals progress\n` +
        `/daily — Full business digest\n` +
        `/help — Show this menu\n\n` +
        `You can also ask me anything in plain language, e.g. <i>"How many orders came in today?"</i>`,
    };
  }
}
