import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import type { ListCustomersDto } from './dto/list-customers.dto';
import type { CreateNoteDto } from './dto/create-note.dto';
import type { CreateTagDto } from './dto/create-tag.dto';

// ── Segmentation ──────────────────────────────────────────────────────────────
// Deterministic rules applied to computed customer metrics.
// A customer may satisfy multiple segments simultaneously.

const SEGMENT_DAYS_NEW = 30;
const SEGMENT_DAYS_ACTIVE = 60;
const SEGMENT_DAYS_AT_RISK = 60;   // previously active but not within this window
const SEGMENT_DAYS_INACTIVE = 180;
const SEGMENT_HIGH_VALUE_NGN = 100_000; // threshold in org currency base unit

export type CustomerSegmentLabel =
  | 'NEW'
  | 'ACTIVE'
  | 'REPEAT'
  | 'HIGH_VALUE'
  | 'AT_RISK'
  | 'INACTIVE'
  | 'OUTSTANDING_BALANCE';

export interface CustomerMetricsRaw {
  orderCount: number;
  completedOrders: number;
  totalSalesValue: number;
  totalAmountPaid: number;
  outstandingAmount: number;
  totalRefunds: number;
  averageOrderValue: number;
  firstPurchaseDate: Date | null;
  latestPurchaseDate: Date | null;
  daysSinceLastPurchase: number | null;
  purchaseFrequencyPerMonth: number | null;
  customerCreatedAt: Date;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── List / Search ─────────────────────────────────────────────────────────

  async findAll(organizationId: string, query: ListCustomersDto) {
    const {
      page = 1,
      limit = 20,
      search,
      isActive,
      sortBy = 'name',
      sortDir = 'asc',
      hasOutstanding,
      tagId,
      segment,
    } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (isActive !== undefined) where['isActive'] = isActive;
    if (hasOutstanding) where['outstandingBalance'] = { gt: 0 };

    // Segment filter: only segments computable from stored customer fields
    if (segment) {
      switch (segment.toUpperCase()) {
        case 'NEW':
          where['createdAt'] = { gte: new Date(Date.now() - SEGMENT_DAYS_NEW * 86_400_000) };
          break;
        case 'HIGH_VALUE':
          where['totalSpent'] = { gte: SEGMENT_HIGH_VALUE_NGN };
          break;
        case 'OUTSTANDING_BALANCE':
          where['outstandingBalance'] = { gt: 0 };
          break;
        // ACTIVE, AT_RISK, INACTIVE, REPEAT require lastPurchaseDate/orderCount — not stored
      }
    }

    if (search) {
      where['OR'] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (tagId) {
      where['tagAssignments'] = { some: { tagId } };
    }

    const orderBy = this.buildOrderBy(sortBy, sortDir);

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          code: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          loyaltyPoints: true,
          totalSpent: true,
          outstandingBalance: true,
          isActive: true,
          createdAt: true,
          tagAssignments: {
            select: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
        },
        orderBy,
      }),
      this.prisma.customer.count({ where }),
    ]);

    // Compute segments client-side from available fields (no extra queries needed for list)
    const now = new Date();
    const enriched = customers.map((c) => ({
      ...c,
      tags: c.tagAssignments.map((a) => a.tag),
      segments: this.computeSegmentsFromFields(
        Number(c.totalSpent),
        Number(c.outstandingBalance),
        null, // lastPurchaseDate not fetched on list for performance
        0,    // orderCount not fetched on list for performance
        c.createdAt,
        now,
      ),
    }));

    return {
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private buildOrderBy(sortBy: string, sortDir: 'asc' | 'desc') {
    const dir = sortDir;
    switch (sortBy) {
      case 'totalSpent': return { totalSpent: dir };
      case 'outstandingBalance': return { outstandingBalance: dir };
      case 'createdAt': return { createdAt: dir };
      default: return [{ firstName: dir }, { lastName: dir }];
    }
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  async findOne(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      include: {
        tagAssignments: {
          include: { tag: { select: { id: true, name: true, color: true } } },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return {
      ...customer,
      tags: customer.tagAssignments.map((a) => a.tag),
    };
  }

  // ── Create / Update / Delete ──────────────────────────────────────────────

  async create(organizationId: string, dto: CreateCustomerDto) {
    const existing = await this.prisma.customer.findFirst({
      where: { organizationId, phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException(`Phone number '${dto.phone}' already registered`);
    }

    const code = dto.code ?? (await this.generateCode(organizationId));

    const customer = await this.prisma.customer.create({
      data: {
        id: createId(),
        organizationId,
        code,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        altPhone: dto.altPhone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country ?? 'Nigeria',
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });

    await this.updateSearchVector(customer.id);

    this.eventEmitter.emit('customer.created', {
      organizationId,
      customerId: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
    });

    return customer;
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (dto.phone && dto.phone !== customer.phone) {
      const conflict = await this.prisma.customer.findFirst({
        where: { organizationId, phone: dto.phone, NOT: { id } },
      });
      if (conflict) throw new ConflictException(`Phone '${dto.phone}' already registered`);
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        altPhone: dto.altPhone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });

    await this.updateSearchVector(id);
    return updated;
  }

  async softDelete(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    await this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Customer deactivated successfully' };
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  async getMetrics(organizationId: string, customerId: string): Promise<{
    data: CustomerMetricsRaw & { segments: CustomerSegmentLabel[] };
  }> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, createdAt: true, outstandingBalance: true, totalSpent: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const [orders, payments] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: { organizationId, customerId },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          createdAt: true,
          completedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: { organizationId, customerId, status: 'COMPLETED' },
        select: { amount: true, receivedAt: true },
      }),
    ]);

    const completedOrders = orders.filter((o) =>
      ['COMPLETED', 'PARTIAL_REFUND'].includes(o.status),
    );

    const totalSalesValue = completedOrders.reduce((s, o) => s + Number(o.totalAmount), 0);
    const totalAmountPaid = payments
      .filter((p) => Number(p.amount) > 0)
      .reduce((s, p) => s + Number(p.amount), 0);
    const totalRefunds = payments
      .filter((p) => Number(p.amount) < 0)
      .reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
    const outstandingAmount = Number(customer.outstandingBalance);

    const dates = completedOrders
      .map((o) => o.completedAt ?? o.createdAt)
      .sort((a, b) => a.getTime() - b.getTime());
    const firstPurchaseDate = dates[0] ?? null;
    const latestPurchaseDate = dates[dates.length - 1] ?? null;

    const now = new Date();
    const daysSinceLastPurchase = latestPurchaseDate
      ? Math.floor((now.getTime() - latestPurchaseDate.getTime()) / 86_400_000)
      : null;

    const averageOrderValue =
      completedOrders.length > 0 ? totalSalesValue / completedOrders.length : 0;

    let purchaseFrequencyPerMonth: number | null = null;
    if (completedOrders.length >= 2 && firstPurchaseDate && latestPurchaseDate) {
      const monthsSpan =
        (latestPurchaseDate.getTime() - firstPurchaseDate.getTime()) /
        (30 * 86_400_000);
      purchaseFrequencyPerMonth =
        monthsSpan > 0 ? completedOrders.length / monthsSpan : completedOrders.length;
    }

    const metrics: CustomerMetricsRaw = {
      orderCount: orders.length,
      completedOrders: completedOrders.length,
      totalSalesValue,
      totalAmountPaid,
      outstandingAmount,
      totalRefunds,
      averageOrderValue,
      firstPurchaseDate,
      latestPurchaseDate,
      daysSinceLastPurchase,
      purchaseFrequencyPerMonth,
      customerCreatedAt: customer.createdAt,
    };

    const segments = this.computeSegmentsFromMetrics(metrics, now);

    return { data: { ...metrics, segments } };
  }

  // ── Segments ──────────────────────────────────────────────────────────────

  private computeSegmentsFromMetrics(
    m: CustomerMetricsRaw,
    now: Date,
  ): CustomerSegmentLabel[] {
    const labels: CustomerSegmentLabel[] = [];
    const daysSince = m.daysSinceLastPurchase;

    const customerAgeDays = Math.floor(
      (now.getTime() - m.customerCreatedAt.getTime()) / 86_400_000,
    );
    const isNew =
      customerAgeDays <= SEGMENT_DAYS_NEW ||
      (m.firstPurchaseDate !== null &&
        Math.floor((now.getTime() - m.firstPurchaseDate.getTime()) / 86_400_000) <=
          SEGMENT_DAYS_NEW);

    if (isNew) labels.push('NEW');
    if (daysSince !== null && daysSince <= SEGMENT_DAYS_ACTIVE) labels.push('ACTIVE');
    if (m.completedOrders > 1) labels.push('REPEAT');
    if (m.totalSalesValue >= SEGMENT_HIGH_VALUE_NGN) labels.push('HIGH_VALUE');

    const wasActive = m.completedOrders > 0;
    const isInactive = daysSince === null || daysSince > SEGMENT_DAYS_INACTIVE;
    const isAtRisk =
      wasActive &&
      daysSince !== null &&
      daysSince > SEGMENT_DAYS_AT_RISK &&
      daysSince <= SEGMENT_DAYS_INACTIVE;

    if (isAtRisk) labels.push('AT_RISK');
    if (isInactive && !isNew) labels.push('INACTIVE');
    if (m.outstandingAmount > 0) labels.push('OUTSTANDING_BALANCE');

    return labels;
  }

  private computeSegmentsFromFields(
    totalSpent: number,
    outstandingBalance: number,
    lastPurchaseDate: Date | null,
    orderCount: number,
    customerCreatedAt: Date,
    now: Date,
  ): CustomerSegmentLabel[] {
    const labels: CustomerSegmentLabel[] = [];
    const customerAgeDays = Math.floor(
      (now.getTime() - customerCreatedAt.getTime()) / 86_400_000,
    );
    if (customerAgeDays <= SEGMENT_DAYS_NEW) labels.push('NEW');
    if (totalSpent >= SEGMENT_HIGH_VALUE_NGN) labels.push('HIGH_VALUE');
    if (outstandingBalance > 0) labels.push('OUTSTANDING_BALANCE');
    if (orderCount > 1) labels.push('REPEAT');
    return labels;
  }

  // ── Timeline ──────────────────────────────────────────────────────────────

  async getTimeline(organizationId: string, customerId: string, limit = 50, locationIds?: string[] | null) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, createdAt: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const locationWhere = this.buildLocationWhere(locationIds);

    const [orders, invoices, payments, receipts, noteRows, tasks] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: { organizationId, customerId, ...locationWhere },
        select: {
          id: true, reference: true, status: true, channel: true,
          totalAmount: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.invoice.findMany({
        where: { organizationId, customerId },
        select: { id: true, reference: true, status: true, totalAmount: true, issuedAt: true },
        orderBy: { issuedAt: 'desc' },
        take: limit,
      }),
      this.prisma.payment.findMany({
        where: { organizationId, customerId, status: 'COMPLETED' },
        select: { id: true, reference: true, amount: true, method: true, receivedAt: true },
        orderBy: { receivedAt: 'desc' },
        take: limit,
      }),
      this.prisma.receipt.findMany({
        where: { organizationId, customerId },
        select: { id: true, reference: true, amount: true, method: true, issuedAt: true },
        orderBy: { issuedAt: 'desc' },
        take: limit,
      }),
      this.prisma.customerNote.findMany({
        where: { organizationId, customerId },
        select: { id: true, content: true, createdBy: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.task.findMany({
        where: { organizationId, customerId },
        select: {
          id: true, title: true, status: true, priority: true,
          dueDate: true, completedAt: true, createdAt: true,
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const events: Array<{ type: string; date: Date; data: Record<string, unknown> }> = [
      { type: 'CUSTOMER_CREATED', date: customer.createdAt, data: {} },
      ...orders.map((o) => ({ type: 'ORDER', date: o.createdAt, data: o as Record<string, unknown> })),
      ...invoices.map((i) => ({ type: 'INVOICE', date: i.issuedAt, data: i as Record<string, unknown> })),
      ...payments.map((p) => ({ type: 'PAYMENT', date: p.receivedAt ?? new Date(0), data: p as Record<string, unknown> })),
      ...receipts.map((r) => ({ type: 'RECEIPT', date: r.issuedAt, data: r as Record<string, unknown> })),
      ...noteRows.map((n) => ({ type: 'NOTE', date: n.createdAt, data: n as Record<string, unknown> })),
      ...tasks.map((t) => ({ type: 'TASK', date: t.createdAt, data: t as Record<string, unknown> })),
    ];

    events.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      data: events.slice(0, limit).map((e) => ({
        type: e.type,
        date: e.date.toISOString(),
        data: e.data,
      })),
    };
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(organizationId: string, customerId: string) {
    await this.assertExists(organizationId, customerId);
    const notes = await this.prisma.customerNote.findMany({
      where: { organizationId, customerId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: notes };
  }

  async addNote(
    organizationId: string,
    customerId: string,
    dto: CreateNoteDto,
    createdBy: string,
  ) {
    await this.assertExists(organizationId, customerId);
    const note = await this.prisma.customerNote.create({
      data: {
        id: createId(),
        organizationId,
        customerId,
        content: dto.content,
        createdBy,
      },
    });
    return note;
  }

  async deleteNote(
    organizationId: string,
    customerId: string,
    noteId: string,
    requesterId: string,
  ) {
    const note = await this.prisma.customerNote.findFirst({
      where: { id: noteId, customerId, organizationId },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.createdBy !== requesterId) {
      throw new ForbiddenException('Only the note author may delete this note');
    }
    await this.prisma.customerNote.delete({ where: { id: noteId } });
    return { message: 'Note deleted' };
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  async listOrgTags(organizationId: string) {
    const tags = await this.prisma.customerTag.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return { data: tags };
  }

  async createTag(organizationId: string, dto: CreateTagDto) {
    const existing = await this.prisma.customerTag.findFirst({
      where: { organizationId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException(`Tag '${dto.name}' already exists`);
    try {
      return await this.prisma.customerTag.create({
        data: {
          id: createId(),
          organizationId,
          name: dto.name,
          color: dto.color ?? '#6B7280',
        },
      });
    } catch (err: unknown) {
      const { Prisma: P } = await import('@prisma/client');
      if (err instanceof P.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Tag '${dto.name}' already exists`);
      }
      throw err;
    }
  }

  async assignTag(organizationId: string, customerId: string, tagId: string) {
    await this.assertExists(organizationId, customerId);
    const tag = await this.prisma.customerTag.findFirst({
      where: { id: tagId, organizationId },
    });
    if (!tag) throw new NotFoundException('Tag not found');

    const exists = await this.prisma.customerTagAssignment.findFirst({
      where: { tagId, customerId },
    });
    if (exists) return exists;

    return this.prisma.customerTagAssignment.create({
      data: { id: createId(), tagId, customerId },
    });
  }

  async removeTag(organizationId: string, customerId: string, tagId: string) {
    await this.assertExists(organizationId, customerId);
    const assignment = await this.prisma.customerTagAssignment.findFirst({
      where: { tagId, customerId, tag: { organizationId } },
    });
    if (!assignment) throw new NotFoundException('Tag assignment not found');
    await this.prisma.customerTagAssignment.delete({ where: { id: assignment.id } });
    return { message: 'Tag removed' };
  }

  // ── Sales History ─────────────────────────────────────────────────────────

  async getSalesHistory(organizationId: string, customerId: string, locationIds?: string[] | null) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const locationWhere = this.buildLocationWhere(locationIds);

    return this.prisma.salesOrder.findMany({
      where: { organizationId, customerId, ...locationWhere },
      select: {
        id: true,
        reference: true,
        status: true,
        channel: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
        completedAt: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Invoices / Receipts (customer-scoped lists) ───────────────────────────

  async getInvoices(organizationId: string, customerId: string) {
    await this.assertExists(organizationId, customerId);
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId, customerId },
      select: {
        id: true, reference: true, status: true,
        totalAmount: true, paidAmount: true, dueDate: true, issuedAt: true,
      },
      orderBy: { issuedAt: 'desc' },
      take: 50,
    });
    return { data: invoices };
  }

  async getReceipts(organizationId: string, customerId: string) {
    await this.assertExists(organizationId, customerId);
    const receipts = await this.prisma.receipt.findMany({
      where: { organizationId, customerId },
      select: { id: true, reference: true, amount: true, method: true, issuedAt: true },
      orderBy: { issuedAt: 'desc' },
      take: 50,
    });
    return { data: receipts };
  }

  // ── Statement ─────────────────────────────────────────────────────────────

  async getStatement(
    organizationId: string,
    customerId: string,
    startDate: string,
    endDate: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, code: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);

    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { organizationId, customerId, createdAt: { gte: start, lt: end } },
        select: {
          id: true, reference: true, status: true, currency: true,
          totalAmount: true, paidAmount: true, dueDate: true, issuedAt: true,
          order: { select: { reference: true } },
        },
        orderBy: { issuedAt: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: {
          organizationId, customerId,
          createdAt: { gte: start, lt: end },
          status: 'COMPLETED',
        },
        select: { id: true, reference: true, amount: true, method: true, receivedAt: true, invoiceId: true },
        orderBy: { receivedAt: 'asc' },
      }),
    ]);

    const totalBilled = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalPaid = payments
      .filter((p) => Number(p.amount) > 0)
      .reduce((s, p) => s + Number(p.amount), 0);
    const totalRefunded = payments
      .filter((p) => Number(p.amount) < 0)
      .reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
    const outstandingBalance = totalBilled - totalPaid + totalRefunded;

    return {
      data: {
        customer,
        dateRange: { start: startDate, end: endDate },
        invoices: invoices.map((i) => ({
          ...i,
          totalAmount: Number(i.totalAmount),
          paidAmount: Number(i.paidAmount),
          balanceDue: Number(i.totalAmount) - Number(i.paidAmount),
        })),
        payments: payments.filter((p) => Number(p.amount) > 0).map((p) => ({
          ...p,
          amount: Number(p.amount),
        })),
        refunds: payments.filter((p) => Number(p.amount) < 0).map((p) => ({
          ...p,
          amount: Math.abs(Number(p.amount)),
        })),
        summary: { totalBilled, totalPaid, totalRefunded, outstandingBalance },
        note: 'Opening balance not available — statement reflects transaction history for the selected period only.',
      },
      meta: { generatedAt: new Date().toISOString() },
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async assertExists(organizationId: string, customerId: string) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Customer not found');
  }

  private buildLocationWhere(locationIds?: string[] | null): Record<string, unknown> {
    if (locationIds === null || locationIds === undefined) return {};
    if (locationIds.length === 0) return { locationId: '__none__' };
    return { locationId: { in: locationIds } };
  }

  private async generateCode(organizationId: string): Promise<string> {
    const count = await this.prisma.customer.count({ where: { organizationId } });
    return `CUST-${String(count + 1).padStart(5, '0')}`;
  }

  private async updateSearchVector(customerId: string) {
    await this.prisma.$executeRaw`
      UPDATE customers SET search_vector = to_tsvector('english',
        coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
        coalesce(phone,'') || ' ' || coalesce(email,'') || ' ' || coalesce(code,'')
      ) WHERE id = ${customerId}
    `;
  }
}
