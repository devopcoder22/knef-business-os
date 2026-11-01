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

    // Location scope for order queries (direct locationId field)
    const orderLocationWhere =
      locationIds === null
        ? {}
        : locationIds.length === 0
        ? { locationId: '__none__' }
        : { locationId: { in: locationIds } };

    // Location scope for PO queries (direct locationId field)
    const poLocationWhere = orderLocationWhere;

    // Location scope for invoice queries (via SalesOrder relation)
    const invoiceLocationWhere =
      locationIds === null
        ? {}
        : locationIds.length === 0
        ? { order: { locationId: '__none__' } }
        : { order: { locationId: { in: locationIds } } };

    // Location scope for payment queries (via Invoice → SalesOrder relation)
    const paymentLocationWhere =
      locationIds === null
        ? {}
        : locationIds.length === 0
        ? { invoice: { order: { locationId: '__none__' } } }
        : { invoice: { order: { locationId: { in: locationIds } } } };

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
      // Today's received payments (location-scoped via invoice.order)
      this.prisma.payment.aggregate({
        where: {
          organizationId,
          status: 'COMPLETED',
          receivedAt: { gte: todayStart, lte: todayEnd },
          amount: { gt: 0 },
          ...paymentLocationWhere,
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

      // Open tasks (TODO + IN_PROGRESS) — org-wide
      this.prisma.task.count({
        where: {
          organizationId,
          status: { in: ['TODO', 'IN_PROGRESS'] },
        },
      }),

      // Pending purchase orders (location-scoped)
      this.prisma.purchaseOrder.count({
        where: {
          organizationId,
          status: { in: ['SUBMITTED', 'APPROVED'] },
          ...poLocationWhere,
        },
      }),

      // Overdue invoices (location-scoped via SalesOrder)
      this.prisma.invoice.count({
        where: {
          organizationId,
          status: { in: ['UNPAID', 'PARTIAL'] },
          dueDate: { lt: now },
          ...invoiceLocationWhere,
        },
      }),

      // New customers this month — org-wide (customers are org-level)
      this.prisma.customer.count({
        where: { organizationId, createdAt: { gte: monthStart } },
      }),

      // Customers with outstanding balance — org-wide
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

      // Recent open tasks — org-wide
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

      // Pending POs detail (location-scoped)
      this.prisma.purchaseOrder.findMany({
        where: {
          organizationId,
          status: { in: ['SUBMITTED', 'APPROVED'] },
          ...poLocationWhere,
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

    // ── Low-stock: authoritative count + limited preview (independent) ──────────
    // Fetch ALL authorized inventory levels without cap, then filter client-side.
    // This avoids the column-to-column comparison limitation in Prisma while
    // ensuring the count is not truncated by a preview limit.
    const allInventoryLevels = await this.prisma.inventoryLevel.findMany({
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
    }).catch(() => [] as never[]);

    const allLowStock = (allInventoryLevels as Array<{
      id: string;
      quantity: number;
      product: { id: string; name: string; sku: string; lowStockAlert: number };
      location: { id: string; name: string };
    }>).filter((r) => r.quantity <= r.product.lowStockAlert);

    const lowStockCount = allLowStock.length;          // authoritative — no preview cap
    const lowStockItems = allLowStock.slice(0, 8);     // preview only

    // Month revenue for comparison
    const monthRevenue = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        status: 'COMPLETED',
        receivedAt: { gte: monthStart, lte: now },
        amount: { gt: 0 },
        ...paymentLocationWhere,
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
        ...paymentLocationWhere,
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

    // Overdue task count
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
