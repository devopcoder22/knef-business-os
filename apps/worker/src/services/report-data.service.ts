import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface ReportRow {
  [key: string]: string | number | boolean | null | Date;
}

export interface ReportDataset {
  title: string;
  headers: string[];
  rows: ReportRow[];
  generatedAt: Date;
}

@Injectable()
export class ReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(
    organizationId: string,
    reportType: string,
    params: Record<string, unknown>,
  ): Promise<ReportDataset> {
    const startDate = params.startDate
      ? new Date(params.startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = params.endDate ? new Date(params.endDate as string) : new Date();

    switch (reportType) {
      case 'sales.summary': return this.salesSummary(organizationId, startDate, endDate);
      case 'sales.orders': return this.salesOrders(organizationId, startDate, endDate);
      case 'inventory.valuation': return this.inventoryValuation(organizationId);
      case 'inventory.low_stock': return this.inventoryLowStock(organizationId);
      case 'finance.pl': return this.financePl(organizationId, startDate, endDate);
      case 'finance.expenses': return this.financeExpenses(organizationId, startDate, endDate);
      case 'staff.attendance': return this.staffAttendance(organizationId, startDate, endDate);
      case 'purchasing.summary': return this.purchasingSummary(organizationId, startDate, endDate);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  // ── Sales summary ─────────────────────────────────────────────────────────

  private async salesSummary(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ReportDataset> {
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
      select: { totalAmount: true, paidAmount: true, createdAt: true },
    });

    const totalRevenue = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    const totalOrders = orders.length;
    const paidOrders = orders.filter((o) => Number(o.paidAmount) >= Number(o.totalAmount) && Number(o.totalAmount) > 0).length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      title: 'Sales Summary',
      headers: ['Metric', 'Value'],
      rows: [
        { Metric: 'Total Orders', Value: totalOrders },
        { Metric: 'Total Revenue', Value: totalRevenue.toFixed(2) },
        { Metric: 'Fully Paid Orders', Value: paidOrders },
        { Metric: 'Average Order Value', Value: avgOrderValue.toFixed(2) },
      ],
      generatedAt: new Date(),
    };
  }

  private async salesOrders(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ReportDataset> {
    const orders = await this.prisma.salesOrder.findMany({
      where: { organizationId, createdAt: { gte: startDate, lte: endDate } },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    return {
      title: 'Sales Orders',
      headers: ['Order #', 'Date', 'Customer', 'Status', 'Total'],
      rows: orders.map((o) => ({
        'Order #': o.reference,
        Date: o.createdAt.toISOString().slice(0, 10),
        Customer: o.customer
          ? `${o.customer.firstName} ${o.customer.lastName}`.trim()
          : 'Walk-in',
        Status: o.status,
        Total: Number(o.totalAmount).toFixed(2),
      })),
      generatedAt: new Date(),
    };
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  private async inventoryValuation(organizationId: string): Promise<ReportDataset> {
    const stock = await this.prisma.inventoryLevel.findMany({
      where: { product: { organizationId } },
      include: {
        product: { select: { name: true, sku: true, costPrice: true } },
        location: { select: { name: true } },
      },
    });

    return {
      title: 'Inventory Valuation',
      headers: ['Product', 'SKU', 'Location', 'Qty', 'Cost Price', 'Total Value'],
      rows: stock.map((s) => ({
        Product: s.product.name,
        SKU: s.product.sku,
        Location: s.location.name,
        Qty: s.quantity,
        'Cost Price': Number(s.product.costPrice).toFixed(2),
        'Total Value': (s.quantity * Number(s.product.costPrice)).toFixed(2),
      })),
      generatedAt: new Date(),
    };
  }

  private async inventoryLowStock(organizationId: string): Promise<ReportDataset> {
    const items = await this.prisma.inventoryLevel.findMany({
      where: { product: { organizationId } },
      include: {
        product: { select: { name: true, sku: true, lowStockAlert: true } },
        location: { select: { name: true } },
      },
    });

    const lowStock = items.filter((i) => i.quantity <= i.product.lowStockAlert);

    return {
      title: 'Low Stock Items',
      headers: ['Product', 'SKU', 'Location', 'Current Qty', 'Alert Threshold'],
      rows: lowStock.map((i) => ({
        Product: i.product.name,
        SKU: i.product.sku,
        Location: i.location.name,
        'Current Qty': i.quantity,
        'Alert Threshold': i.product.lowStockAlert,
      })),
      generatedAt: new Date(),
    };
  }

  // ── Finance ───────────────────────────────────────────────────────────────

  private async financePl(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ReportDataset> {
    const [orders, expenses] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: {
          organizationId,
          createdAt: { gte: startDate, lte: endDate },
          status: { not: 'CANCELLED' },
          paidAmount: { gt: 0 },
        },
        select: { totalAmount: true },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          date: { gte: startDate, lte: endDate },
          status: { not: 'REJECTED' },
        },
        select: { amount: true, category: { select: { name: true } } },
      }),
    ]);

    const revenue = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const netProfit = revenue - totalExpenses;

    const rows: ReportRow[] = [
      { Category: 'Revenue', Amount: revenue.toFixed(2) },
    ];

    // Group expenses by category name
    const byCat: Record<string, number> = {};
    for (const e of expenses) {
      const cat = e.category?.name ?? 'Uncategorized';
      byCat[cat] = (byCat[cat] ?? 0) + Number(e.amount);
    }
    for (const [cat, amount] of Object.entries(byCat)) {
      rows.push({ Category: `Expense — ${cat}`, Amount: (-amount).toFixed(2) });
    }
    rows.push({ Category: 'Net Profit', Amount: netProfit.toFixed(2) });

    return {
      title: 'Profit & Loss',
      headers: ['Category', 'Amount'],
      rows,
      generatedAt: new Date(),
    };
  }

  private async financeExpenses(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ReportDataset> {
    const expenses = await this.prisma.expense.findMany({
      where: { organizationId, date: { gte: startDate, lte: endDate } },
      include: { category: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 1000,
    });

    return {
      title: 'Expenses',
      headers: ['Date', 'Category', 'Description', 'Amount', 'Status'],
      rows: expenses.map((e) => ({
        Date: e.date.toISOString().slice(0, 10),
        Category: e.category?.name ?? '',
        Description: e.description,
        Amount: Number(e.amount).toFixed(2),
        Status: e.status,
      })),
      generatedAt: new Date(),
    };
  }

  // ── Staff ─────────────────────────────────────────────────────────────────

  private async staffAttendance(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ReportDataset> {
    const records = await this.prisma.attendance.findMany({
      where: {
        employee: { organizationId },
        date: { gte: startDate, lte: endDate },
      },
      include: {
        employee: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ date: 'desc' }],
      take: 2000,
    });

    return {
      title: 'Staff Attendance',
      headers: ['Employee', 'Date', 'Clock In', 'Clock Out', 'Hours', 'Status'],
      rows: records.map((r) => {
        const hours =
          r.clockIn && r.clockOut
            ? ((r.clockOut.getTime() - r.clockIn.getTime()) / 3_600_000).toFixed(2)
            : null;
        return {
          Employee: `${r.employee.user.firstName} ${r.employee.user.lastName}`.trim(),
          Date: r.date.toISOString().slice(0, 10),
          'Clock In': r.clockIn?.toISOString().slice(11, 16) ?? '',
          'Clock Out': r.clockOut?.toISOString().slice(11, 16) ?? '',
          Hours: hours ?? '',
          Status: r.status,
        };
      }),
      generatedAt: new Date(),
    };
  }

  // ── Purchasing ────────────────────────────────────────────────────────────

  private async purchasingSummary(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ReportDataset> {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { organizationId, createdAt: { gte: startDate, lte: endDate } },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    return {
      title: 'Purchasing Summary',
      headers: ['PO #', 'Date', 'Supplier', 'Status', 'Total'],
      rows: orders.map((o) => ({
        'PO #': o.reference,
        Date: o.createdAt.toISOString().slice(0, 10),
        Supplier: o.supplier.name,
        Status: o.status,
        Total: Number(o.totalAmount).toFixed(2),
      })),
      generatedAt: new Date(),
    };
  }
}
