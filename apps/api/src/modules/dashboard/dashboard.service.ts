import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

type RecentTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
  customer: { id: string; firstName: string; lastName: string } | null;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(organizationId: string, locationIds: string[] | null) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Location scope for order queries
    const orderLocationWhere =
      locationIds === null
        ? {}
        : locationIds.length === 0
        ? { locationId: '__none__' }
        : { locationId: { in: locationIds } };

    // Location scope for inventoryLevel queries (via relation filter)
    const inventoryLocationFilter =
      locationIds === null
        ? {}
        : locationIds.length === 0
        ? { location: { id: '__none__' } }
        : { location: { id: { in: locationIds } } };

    const [
      todayRevenue,
      activeOrders,
      openTasks,
      pendingPOs,
      overdueInvoices,
      newCustomersThisMonth,
      customersWithOutstanding,
      recentSales,
      recentTasks,
      pendingPOItems,
    ] = await Promise.all([
      // Today's received payments
      this.prisma.payment.aggregate({
        where: {
          organizationId,
          status: 'COMPLETED',
          receivedAt: { gte: todayStart, lte: todayEnd },
          amount: { gt: 0 },
        },
        _sum: { amount: true },
      }),

      // Active orders (CONFIRMED + PROCESSING)
      this.prisma.salesOrder.count({
        where: {
          organizationId,
          status: { in: ['CONFIRMED', 'PROCESSING'] },
          ...orderLocationWhere,
        },
      }),

      // Open tasks (TODO + IN_PROGRESS)
      this.prisma.task.count({
        where: {
          organizationId,
          status: { in: ['TODO', 'IN_PROGRESS'] },
        },
      }),

      // Pending purchase orders (SUBMITTED + APPROVED — not yet received)
      this.prisma.purchaseOrder.count({
        where: {
          organizationId,
          status: { in: ['SUBMITTED', 'APPROVED'] },
        },
      }),

      // Overdue invoices (UNPAID or PARTIAL, dueDate in the past)
      this.prisma.invoice.count({
        where: {
          organizationId,
          status: { in: ['UNPAID', 'PARTIAL'] },
          dueDate: { lt: now },
        },
      }),

      // New customers this month
      this.prisma.customer.count({
        where: { organizationId, createdAt: { gte: monthStart } },
      }),

      // Customers with outstanding balance
      this.prisma.customer.count({
        where: { organizationId, outstandingBalance: { gt: 0 } },
      }),

      // Recent sales (last 8 completed or confirmed orders)
      this.prisma.salesOrder.findMany({
        where: {
          organizationId,
          status: { in: ['COMPLETED', 'CONFIRMED', 'PROCESSING'] },
          ...orderLocationWhere,
        },
        select: {
          id: true,
          reference: true,
          status: true,
          channel: true,
          totalAmount: true,
          paidAmount: true,
          createdAt: true,
          customer: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),

      // Recent open tasks
      this.prisma.task.findMany({
        where: {
          organizationId,
          status: { in: ['TODO', 'IN_PROGRESS'] },
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          assignee: { select: { id: true, firstName: true, lastName: true } },
          customer: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        take: 8,
      }),

      // Pending POs detail (for Needs Attention)
      this.prisma.purchaseOrder.findMany({
        where: {
          organizationId,
          status: { in: ['SUBMITTED', 'APPROVED'] },
        },
        select: {
          id: true,
          reference: true,
          status: true,
          expectedDate: true,
          totalAmount: true,
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { expectedDate: 'asc' },
        take: 5,
      }),
    ]);

    // Low-stock: fetch inventoryLevels and filter client-side against product.lowStockAlert
    const inventoryLevelRows = await this.prisma.inventoryLevel.findMany({
      where: {
        product: { organizationId },
        ...inventoryLocationFilter,
      },
      select: {
        id: true,
        quantity: true,
        product: { select: { id: true, name: true, sku: true, lowStockAlert: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { quantity: 'asc' },
      take: 200,
    }).catch(() => [] as never[]);

    const lowStockItems = (inventoryLevelRows as Array<{
      id: string;
      quantity: number;
      product: { id: string; name: string; sku: string; lowStockAlert: number };
      location: { id: string; name: string };
    }>).filter((r) => r.quantity <= r.product.lowStockAlert).slice(0, 8);

    const lowStockCount = lowStockItems.length;

    // Month revenue for comparison
    const monthRevenue = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        status: 'COMPLETED',
        receivedAt: { gte: monthStart, lte: now },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });

    // Previous period: same-length window ending at the same day-of-month last month
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 23, 59, 59);
    const prevMonthRevenue = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        status: 'COMPLETED',
        receivedAt: { gte: prevMonthStart, lte: prevMonthEnd },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });

    const todayRev = Number(todayRevenue._sum.amount ?? 0);
    const monthRev = Number(monthRevenue._sum.amount ?? 0);
    const prevMonthRev = Number(prevMonthRevenue._sum.amount ?? 0);
    const monthVsPrev =
      prevMonthRev > 0
        ? Math.round(((monthRev - prevMonthRev) / prevMonthRev) * 100)
        : null;

    // Overdue task count — dedicated query to avoid truncation by preview take limit
    const overdueTaskCount = await this.prisma.task.count({
      where: {
        organizationId,
        status: { in: ['TODO', 'IN_PROGRESS'] },
        dueDate: { lt: now },
      },
    });

    // Needs Attention items
    const needsAttention: Array<{ type: string; label: string; count: number; link: string }> = [];
    if (overdueInvoices > 0)
      needsAttention.push({ type: 'OVERDUE_INVOICES', label: 'Overdue Invoices', count: overdueInvoices, link: '/invoices?status=OVERDUE' });
    if (pendingPOs > 0)
      needsAttention.push({ type: 'PENDING_POS', label: 'Pending Purchase Orders', count: pendingPOs, link: '/purchasing/orders?status=SUBMITTED' });
    if (lowStockCount > 0)
      needsAttention.push({ type: 'LOW_STOCK', label: 'Low Stock Items', count: lowStockCount, link: '/reports/inventory?view=low-stock' });
    if (customersWithOutstanding > 0)
      needsAttention.push({ type: 'OUTSTANDING_CUSTOMERS', label: 'Customers with Balance Due', count: customersWithOutstanding, link: '/customers?hasOutstanding=true' });
    if (overdueTaskCount > 0)
      needsAttention.push({ type: 'OVERDUE_TASKS', label: 'Overdue Tasks', count: overdueTaskCount, link: '/tasks?status=TODO&overdue=true' });

    return {
      data: {
        kpis: {
          todayRevenue: todayRev,
          activeOrders,
          lowStockCount,
          openTasks,
          pendingPOs,
          overdueInvoices,
          newCustomersThisMonth,
          customersWithOutstanding,
          monthRevenue: monthRev,
          monthVsPrevPercent: monthVsPrev,
        },
        recentSales: (recentSales as Array<{ totalAmount: unknown; paidAmount: unknown } & Record<string, unknown>>).map((o) => ({
          ...o,
          totalAmount: Number(o.totalAmount),
          paidAmount: Number(o.paidAmount),
        })),
        recentTasks,
        lowStockItems,
        pendingPOItems,
        needsAttention,
      },
      meta: { generatedAt: new Date().toISOString() },
    };
  }
}
