import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, InvoiceStatus, PaymentStatus, MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { BusinessRuleService } from '../business-rules/business-rules.service';
import { AuditService } from '../audit/audit.service';
import type { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import type { ListSalesOrdersDto } from './dto/list-sales-orders.dto';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import type { RecordPaymentDto } from './dto/record-payment.dto';
import type { RefundOrderDto } from './dto/refund-order.dto';

function generateReference(prefix: string): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${dateStr}-${rand}`;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly businessRuleService: BusinessRuleService,
    private readonly auditService: AuditService,
  ) {}

  // ── Sales Orders ──────────────────────────────────────────────

  async listSalesOrders(organizationId: string, query: ListSalesOrdersDto, locationIds: string[] | null = null) {
    const { page = 1, limit = 20, status, customerId, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (locationIds !== null) {
      where['locationId'] = { in: locationIds };
    }
    if (status) where['status'] = status;
    if (customerId) where['customerId'] = customerId;
    if (search) {
      where['OR'] = [
        { reference: { contains: search, mode: 'insensitive' } },
        { customer: { firstName: { contains: search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          reference: true,
          status: true,
          channel: true,
          totalAmount: true,
          paidAmount: true,
          currency: true,
          createdAt: true,
          completedAt: true,
          customer: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
          location: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      data: orders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findSalesOrder(organizationId: string, id: string, locationIds: string[] | null = null) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, organizationId },
      include: {
        customer: true,
        location: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
        invoices: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order && locationIds !== null && !locationIds.includes(order.locationId)) {
      throw new NotFoundException('Sales order not found');
    }
    return order;
  }

  async createSalesOrder(
    organizationId: string,
    dto: CreateSalesOrderDto,
    userId: string,
    locationIds: string[] | null = null,
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Sales order must have at least one item');
    }
    if (locationIds !== null && dto.locationId) {
      if (!locationIds.includes(dto.locationId)) {
        throw new ForbiddenException('Not authorized to create orders for this location');
      }
    }

    const reference = generateReference('SO');

    // Calculate totals server-side
    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);

    const itemsData = dto.items.map((item) => {
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      const discountRate = new Prisma.Decimal(item.discountRate ?? '0');
      const taxRate = new Prisma.Decimal(item.taxRate ?? '0');
      const baseLineTotal = unitPrice.mul(item.quantity);
      const discountAmt = baseLineTotal.mul(discountRate.div(100));
      const afterDiscount = baseLineTotal.sub(discountAmt);
      const taxAmt = afterDiscount.mul(taxRate.div(100));
      const lineTotal = afterDiscount.add(taxAmt);

      subtotal = subtotal.add(baseLineTotal);
      taxTotal = taxTotal.add(taxAmt);
      discountTotal = discountTotal.add(discountAmt);

      return {
        id: createId(),
        productId: item.productId,
        variantId: item.variantId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: unitPrice.toString(),
        costPrice: item.costPrice,
        discountRate: discountRate.toString(),
        taxRate: taxRate.toString(),
        totalPrice: lineTotal.toString(),
        notes: item.notes,
      };
    });

    const totalAmount = subtotal.sub(discountTotal).add(taxTotal);

    // ── Business rule enforcement BEFORE committing to DB ──────────
    const ruleChecks: Record<string, unknown> = {};
    const subtotalNum = Number(subtotal);

    if (subtotalNum > 0) {
      const discountPct = (Number(discountTotal) / subtotalNum) * 100;
      const discountCheck = await this.businessRuleService.checkDiscount(organizationId, discountPct);
      ruleChecks.discount = discountCheck;

      // Hard block if discount exceeds threshold (V1.1: no separate approval workflow)
      if (discountCheck.approvalRequired) {
        throw new BadRequestException(discountCheck.reason);
      }

      // Margin check — require ALL items to have costPrice if ANY do (prevent partial bypass)
      const hasAnyCosts = dto.items.some((i) => i.costPrice !== undefined && i.costPrice !== null);
      const hasAllCosts = dto.items.every((i) => i.costPrice !== undefined && i.costPrice !== null);

      if (hasAnyCosts && !hasAllCosts) {
        throw new BadRequestException(
          'All items must include costPrice when any item provides one',
        );
      }

      if (hasAllCosts) {
        const costTotal = dto.items.reduce(
          (sum, item) => sum + Number(item.costPrice) * item.quantity,
          0,
        );
        const marginPct = ((subtotalNum - costTotal) / subtotalNum) * 100;
        const marginCheck = await this.businessRuleService.checkMargin(organizationId, marginPct);
        ruleChecks.margin = marginCheck;

        // Margin hard block
        if (!marginCheck.allowed) {
          throw new BadRequestException(marginCheck.reason);
        }
      }
    }
    // ───────────────────────────────────────────────────────────────

    const order = await this.prisma.salesOrder.create({
      data: {
        id: createId(),
        organizationId,
        reference,
        customerId: dto.customerId,
        locationId: dto.locationId,
        userId,
        status: OrderStatus.DRAFT,
        channel: dto.channel ?? 'IN_STORE',
        currency: dto.currency ?? 'NGN',
        subtotal: subtotal.toString(),
        discountAmount: discountTotal.toString(),
        taxAmount: taxTotal.toString(),
        totalAmount: totalAmount.toString(),
        notes: dto.notes,
        internalNotes: dto.internalNotes,
        posSessionId: dto.posSessionId,
        items: { create: itemsData },
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    this.eventEmitter.emit('order.created', {
      organizationId,
      orderId: order.id,
      reference: order.reference,
      customerId: order.customerId,
      totalAmount: order.totalAmount.toString(),
      locationId: order.locationId,
      channel: order.channel,
      actorUserId: userId,
    });

    return { ...order, ruleChecks };
  }

  async confirmSalesOrder(organizationId: string, id: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, organizationId },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be confirmed');
    }

    return this.prisma.salesOrder.update({
      where: { id },
      data: { status: OrderStatus.CONFIRMED },
    });
  }

  async completeSalesOrder(organizationId: string, id: string, userId: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (
      order.status !== OrderStatus.CONFIRMED &&
      order.status !== OrderStatus.PROCESSING &&
      order.status !== OrderStatus.DRAFT
    ) {
      throw new BadRequestException('Order cannot be completed in its current state');
    }

    // Deduct stock
    for (const item of order.items) {
      await this.inventoryService.recordMovement(organizationId, {
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        locationId: order.locationId,
        type: MovementType.SALE,
        quantity: -item.quantity,
        referenceType: 'SalesOrder',
        referenceId: id,
        notes: `Sale: ${order.reference}`,
        createdBy: userId,
      });
    }

    await this.prisma.salesOrder.update({
      where: { id },
      data: {
        status: OrderStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    // Update customer stats
    if (order.customerId) {
      const loyaltyPointsEarned = Math.floor(
        parseFloat(order.totalAmount.toString()) / 100,
      );
      await this.prisma.customer.update({
        where: { id: order.customerId },
        data: {
          totalSpent: { increment: order.totalAmount },
          loyaltyPoints: { increment: loyaltyPointsEarned },
        },
      });
    }

    const completed = await this.findSalesOrder(organizationId, id);

    this.eventEmitter.emit('order.completed', {
      organizationId,
      orderId: completed.id,
      reference: completed.reference,
      customerId: completed.customerId,
      totalAmount: completed.totalAmount.toString(),
      locationId: completed.locationId,
      actorUserId: userId,
    });

    return completed;
  }

  async cancelSalesOrder(
    organizationId: string,
    id: string,
    reason?: string,
  ) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, organizationId },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException('Order cannot be cancelled in its current state');
    }

    const cancelled = await this.prisma.salesOrder.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    this.eventEmitter.emit('order.cancelled', {
      organizationId,
      orderId: cancelled.id,
      reference: cancelled.reference,
      customerId: cancelled.customerId,
      totalAmount: cancelled.totalAmount.toString(),
      locationId: cancelled.locationId,
      reason: reason ?? null,
    });

    return cancelled;
  }

  async refundSalesOrder(
    organizationId: string,
    id: string,
    dto: RefundOrderDto,
    userId: string,
  ) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Only COMPLETED orders can be refunded');
    }

    const itemsToRefund = dto.items && dto.items.length > 0 ? dto.items : null;

    // Return inventory
    const itemsForMovement = itemsToRefund
      ? order.items.filter((oi) =>
          itemsToRefund.some((ri) => ri.productId === oi.productId),
        )
      : order.items;

    for (const item of itemsForMovement) {
      const refundItem = itemsToRefund?.find((ri) => ri.productId === item.productId);
      const qty = refundItem?.quantity ?? item.quantity;

      await this.inventoryService.recordMovement(organizationId, {
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        locationId: order.locationId,
        type: MovementType.RETURN_IN,
        quantity: qty,
        referenceType: 'SalesOrder',
        referenceId: id,
        notes: `Refund: ${dto.reason ?? 'Customer return'}`,
        createdBy: userId,
      });
    }

    const refundAmount = dto.refundAmount ?? order.totalAmount.toString();
    const isFullRefund = !dto.items || dto.items.length === 0;

    // Evaluate refund rule (audit and flag — refund still proceeds)
    const refundRuleCheck = await this.businessRuleService.checkRefundAmount(
      organizationId,
      Number(refundAmount),
    );

    // Create reversal payment
    const refundReference = generateReference('RFD');
    await this.prisma.payment.create({
      data: {
        id: createId(),
        organizationId,
        reference: refundReference,
        orderId: id,
        customerId: order.customerId,
        amount: `-${refundAmount}`,
        method: 'CASH',
        status: PaymentStatus.REFUNDED,
        notes: dto.reason ?? 'Refund',
        receivedAt: new Date(),
      },
    });

    const updated = await this.prisma.salesOrder.update({
      where: { id },
      data: {
        status: isFullRefund ? OrderStatus.REFUNDED : OrderStatus.PARTIAL_REFUND,
      },
    });

    void this.auditService.log({
      organizationId,
      userId,
      action: 'SALES_ORDER_REFUNDED',
      entity: 'SalesOrder',
      entityId: id,
      newValues: {
        refundAmount,
        reason: dto.reason,
        isFullRefund,
        ruleCheck: refundRuleCheck,
      },
    });

    return { ...updated, ruleCheck: refundRuleCheck };
  }

  // ── Invoices ──────────────────────────────────────────────────

  async listInvoices(organizationId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { organizationId };

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          reference: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          currency: true,
          dueDate: true,
          issuedAt: true,
          customer: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findInvoice(organizationId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: {
        customer: true,
        order: {
          select: { id: true, reference: true, channel: true, locationId: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async createInvoice(organizationId: string, dto: CreateInvoiceDto) {
    const reference = generateReference('INV');

    let subtotal = new Prisma.Decimal(0);
    let taxAmount = new Prisma.Decimal(0);
    let discountAmount = new Prisma.Decimal(0);
    let itemsData: Array<{
      id: string;
      productId?: string;
      variantId?: string;
      description: string;
      quantity: number;
      unitPrice: string;
      taxRate: string;
      discountRate: string;
      totalPrice: string;
    }> = [];

    if (dto.orderId) {
      const order = await this.prisma.salesOrder.findFirst({
        where: { id: dto.orderId, organizationId },
        include: {
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
        },
      });
      if (!order) throw new NotFoundException('Sales order not found');

      subtotal = new Prisma.Decimal(order.subtotal.toString());
      taxAmount = new Prisma.Decimal(order.taxAmount.toString());
      discountAmount = new Prisma.Decimal(order.discountAmount.toString());

      itemsData = order.items.map((item) => ({
        id: createId(),
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        description: item.description ?? item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
        discountRate: item.discountRate.toString(),
        totalPrice: item.totalPrice.toString(),
      }));
    }

    const totalAmount = subtotal.sub(discountAmount).add(taxAmount);

    const invoice = await this.prisma.invoice.create({
      data: {
        id: createId(),
        organizationId,
        reference,
        orderId: dto.orderId,
        customerId: dto.customerId,
        status: InvoiceStatus.UNPAID,
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        discountAmount: discountAmount.toString(),
        totalAmount: totalAmount.toString(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
        terms: dto.terms,
        items: itemsData.length > 0 ? { create: itemsData } : undefined,
      },
      include: {
        items: true,
        customer: true,
      },
    });

    this.eventEmitter.emit('invoice.created', {
      organizationId,
      invoiceId: invoice.id,
      reference: invoice.reference,
      customerId: invoice.customerId,
      totalAmount: invoice.totalAmount.toString(),
      dueDate: invoice.dueDate?.toISOString() ?? null,
    });

    return invoice;
  }

  async recordPayment(
    organizationId: string,
    invoiceId: string,
    dto: RecordPaymentDto,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot record payment for a cancelled invoice');
    }

    const paymentAmount = new Prisma.Decimal(dto.amount);
    const newPaidAmount = new Prisma.Decimal(invoice.paidAmount.toString()).add(paymentAmount);

    let newStatus: InvoiceStatus;
    if (newPaidAmount.gte(invoice.totalAmount)) {
      newStatus = InvoiceStatus.PAID;
    } else if (newPaidAmount.gt(0)) {
      newStatus = InvoiceStatus.PARTIAL;
    } else {
      newStatus = invoice.status;
    }

    const paymentReference = generateReference('PAY');

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          id: createId(),
          organizationId,
          reference: paymentReference,
          invoiceId,
          customerId: invoice.customerId,
          amount: dto.amount,
          method: dto.method,
          status: PaymentStatus.COMPLETED,
          gatewayRef: dto.reference,
          notes: dto.notes,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount.toString(),
          status: newStatus,
        },
      });

      // If invoice linked to order, update order paid amount
      if (invoice.orderId) {
        await tx.salesOrder.update({
          where: { id: invoice.orderId },
          data: { paidAmount: { increment: paymentAmount } },
        });
      }
    });

    const updatedInvoice = await this.findInvoice(organizationId, invoiceId);

    this.eventEmitter.emit('payment.received', {
      organizationId,
      invoiceId,
      orderId: invoice.orderId,
      amount: dto.amount,
      method: dto.method,
      customerId: invoice.customerId,
    });

    if (newStatus === InvoiceStatus.PAID) {
      this.eventEmitter.emit('invoice.paid', {
        organizationId,
        invoiceId,
        reference: updatedInvoice.reference,
        customerId: invoice.customerId,
        totalAmount: invoice.totalAmount.toString(),
      });
    }

    return updatedInvoice;
  }
}
