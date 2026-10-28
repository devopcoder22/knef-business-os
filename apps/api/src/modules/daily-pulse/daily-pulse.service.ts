import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class DailyPulseService {
  constructor(private readonly prisma: PrismaService) {}

  async getPulse(organizationId: string, targetDate?: string) {
    const date = targetDate ? new Date(targetDate) : new Date();
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const yesterday = new Date(dayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(dayStart);
    yesterdayEnd.setMilliseconds(-1);

    const [
      todaySales,
      yesterdaySales,
      todayOrders,
      todayPurchases,
      pendingPOs,
      pendingInvoices,
      lowStockCount,
      pendingAdjustments,
      overdueInvoices,
      newCustomers,
      attendanceToday,
    ] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: { organizationId, createdAt: { gte: dayStart, lte: dayEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.salesOrder.aggregate({
        where: { organizationId, createdAt: { gte: yesterday, lte: yesterdayEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.salesOrder.count({
        where: { organizationId, createdAt: { gte: dayStart, lte: dayEnd } },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: { organizationId, createdAt: { gte: dayStart, lte: dayEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.purchaseOrder.count({
        where: { organizationId, status: 'SUBMITTED' },
      }),
      this.prisma.supplierInvoice.count({
        where: {
          organizationId,
          status: { in: ['UNPAID', 'PARTIAL'] },
          dueDate: { lte: new Date() },
        },
      }),
      this.prisma.inventoryLevel.count({
        where: {
          product: {
            organizationId,
            trackInventory: true,
          },
          quantity: { lte: 5 },
        },
      }),
      this.prisma.stockAdjustment.count({
        where: { organizationId, status: 'PENDING' },
      }),
      this.prisma.supplierInvoice.aggregate({
        where: {
          organizationId,
          status: { in: ['UNPAID', 'PARTIAL'] },
          dueDate: { lte: new Date() },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.customer.count({
        where: { organizationId, createdAt: { gte: dayStart, lte: dayEnd } },
      }),
      this.prisma.attendance.count({
        where: {
          organizationId,
          date: { gte: dayStart, lte: dayEnd },
          clockIn: { not: null },
        },
      }),
    ]);

    const todaySalesAmount = Number(todaySales._sum.totalAmount ?? 0);
    const yesterdaySalesAmount = Number(yesterdaySales._sum.totalAmount ?? 0);
    const salesGrowth = yesterdaySalesAmount > 0
      ? ((todaySalesAmount - yesterdaySalesAmount) / yesterdaySalesAmount) * 100
      : null;

    return {
      date: dayStart.toISOString().split('T')[0],
      sales: {
        today: todaySalesAmount,
        yesterday: yesterdaySalesAmount,
        growthPct: salesGrowth !== null ? Math.round(salesGrowth * 10) / 10 : null,
        orderCount: todayOrders,
      },
      purchasing: {
        todayAmount: Number(todayPurchases._sum.totalAmount ?? 0),
        todayOrders: todayPurchases._count,
        pendingApproval: pendingPOs,
      },
      finance: {
        pendingInvoices,
        overdueInvoiceAmount: Number(overdueInvoices._sum.amount ?? 0),
        overdueInvoiceCount: overdueInvoices._count,
      },
      inventory: {
        lowStockItems: lowStockCount,
        pendingAdjustments,
      },
      customers: {
        newToday: newCustomers,
      },
      staff: {
        clockedInToday: attendanceToday,
      },
    };
  }
}
