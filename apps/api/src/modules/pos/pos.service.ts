import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { SessionStatus, OrderStatus, PaymentStatus, MovementType, Prisma, SerializedUnitStatus, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import type { PrismaTx } from '../inventory/inventory.service';
import type { OpenSessionDto } from './dto/open-session.dto';
import type { CloseSessionDto } from './dto/close-session.dto';
import type { POSSaleDto } from './dto/pos-sale.dto';

function generateReference(prefix: string): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${dateStr}-${rand}`;
}

@Injectable()
export class POSService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async openSession(organizationId: string, userId: string, dto: OpenSessionDto) {
    // Check if user already has an open session
    const existing = await this.prisma.pOSSession.findFirst({
      where: {
        organizationId,
        userId,
        locationId: dto.locationId,
        status: SessionStatus.OPEN,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have an open POS session at this location',
      );
    }

    const reference = generateReference('POS');

    return this.prisma.pOSSession.create({
      data: {
        id: createId(),
        organizationId,
        locationId: dto.locationId,
        userId,
        reference,
        status: SessionStatus.OPEN,
        openingFloat: dto.openingFloat ?? '0',
        notes: dto.notes,
      },
      include: {
        location: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async getCurrentSession(organizationId: string, userId: string, locationId?: string) {
    const where: Record<string, unknown> = {
      organizationId,
      userId,
      status: SessionStatus.OPEN,
    };
    if (locationId) where['locationId'] = locationId;

    const session = await this.prisma.pOSSession.findFirst({
      where,
      include: {
        location: { select: { id: true, name: true, code: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) throw new NotFoundException('No open POS session found');
    return session;
  }

  async closeSession(
    organizationId: string,
    sessionId: string,
    userId: string,
    dto: CloseSessionDto,
  ) {
    const session = await this.prisma.pOSSession.findFirst({
      where: { id: sessionId, organizationId, userId },
    });
    if (!session) throw new NotFoundException('POS session not found');
    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException('Session is not open');
    }

    const closingFloat = new Prisma.Decimal(dto.closingFloat);
    const totalSalesNum = new Prisma.Decimal(session.totalSales.toString());
    const expectedCash = new Prisma.Decimal(session.openingFloat.toString()).add(totalSalesNum);
    const variance = closingFloat.sub(expectedCash);

    return this.prisma.pOSSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.CLOSED,
        closingFloat: closingFloat.toString(),
        expectedCash: expectedCash.toString(),
        variance: variance.toString(),
        closedAt: new Date(),
        notes: dto.notes,
      },
    });
  }

  async processSale(
    organizationId: string,
    sessionId: string,
    userId: string,
    dto: POSSaleDto,
  ) {
    const session = await this.prisma.pOSSession.findFirst({
      where: { id: sessionId, organizationId, userId },
    });
    if (!session) throw new NotFoundException('POS session not found');
    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException('POS session is not open');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Sale must have at least one item');
    }

    const SELLABLE_STATUSES: SerializedUnitStatus[] = [SerializedUnitStatus.IN_STOCK, SerializedUnitStatus.RETURNED];

    // Pre-scan: reject duplicate serialized unit IDs before any DB call
    const allSerializedIds = dto.items.filter((i) => i.serializedUnitId).map((i) => i.serializedUnitId!);
    if (new Set(allSerializedIds).size !== allSerializedIds.length) {
      throw new BadRequestException('Sale contains duplicate serialized unit IDs');
    }

    // Preload and validate all serialized units into an authoritative map
    const serializedUnitsMap = new Map<string, {
      id: string; imei1: string; imei2: string | null; serialNumber: string | null;
      status: SerializedUnitStatus; locationId: string | null; productId: string;
    }>();
    for (const item of dto.items) {
      if (item.serializedUnitId) {
        const unit = await this.prisma.serializedUnit.findFirst({
          where: { id: item.serializedUnitId, organizationId },
          select: {
            id: true, imei1: true, imei2: true, serialNumber: true,
            status: true, locationId: true, productId: true,
            product: { select: { id: true, status: true } },
            variant: { select: { id: true, isActive: true } },
          },
        });
        if (!unit) throw new NotFoundException(`Serialized unit not found: ${item.serializedUnitId}`);
        if (unit.product.status === ProductStatus.DISCONTINUED) {
          throw new BadRequestException(`Product is discontinued and cannot be sold`);
        }
        if (unit.variant && !unit.variant.isActive) {
          throw new BadRequestException(`Product variant is inactive and cannot be sold`);
        }
        if (unit.productId !== item.productId) {
          throw new BadRequestException(`Unit ${item.serializedUnitId} does not match product ${item.productId}`);
        }
        if (!SELLABLE_STATUSES.includes(unit.status as SerializedUnitStatus)) {
          throw new BadRequestException(`Unit ${unit.imei1} has status ${unit.status} and cannot be sold`);
        }
        if (unit.locationId !== session.locationId) {
          throw new BadRequestException(`Unit ${unit.imei1} is at a different location and cannot be sold from this session`);
        }
        if (item.quantity !== 1) {
          throw new BadRequestException(`Serialized unit ${unit.imei1}: quantity must be 1, got ${item.quantity}`);
        }
        serializedUnitsMap.set(item.serializedUnitId, unit as any);
      }
    }

    const reference = generateReference('SO');

    // Calculate totals (no DB)
    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    for (const item of dto.items) {
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      const discountRate = new Prisma.Decimal(item.discountRate ?? '0');
      const lineSubtotal = unitPrice.mul(item.quantity);
      const discountAmt = lineSubtotal.mul(discountRate.div(100));
      subtotal = subtotal.add(lineSubtotal);
      discountTotal = discountTotal.add(discountAmt);
    }

    const totalPayments = dto.payments.reduce(
      (sum, p) => sum.add(new Prisma.Decimal(p.amount)),
      new Prisma.Decimal(0),
    );
    const totalAmount = subtotal.sub(discountTotal);

    // ALL writes in ONE $transaction
    const order = await this.prisma.$transaction(async (tx) => {
      // Atomic claim: updateMany with status condition + count check (closes double-sale race)
      for (const [unitId, unit] of serializedUnitsMap) {
        const claimed = await tx.serializedUnit.updateMany({
          where: {
            id: unitId,
            organizationId,
            locationId: session.locationId,
            status: { in: SELLABLE_STATUSES },
          },
          data: { status: SerializedUnitStatus.SOLD },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException(`Unit ${unit.imei1 ?? unitId} is no longer available`);
        }
      }

      // Build items with human-readable serial identifiers
      const itemsData = dto.items.map((item) => {
        const unit = item.serializedUnitId ? serializedUnitsMap.get(item.serializedUnitId) : null;
        const serialId = unit ? (unit.imei1 ?? unit.imei2 ?? unit.serialNumber) : null;
        const unitPrice = new Prisma.Decimal(item.unitPrice);
        const discountRate = new Prisma.Decimal(item.discountRate ?? '0');
        const lineSubtotal = unitPrice.mul(item.quantity);
        const discountAmt = lineSubtotal.mul(discountRate.div(100));
        const lineTotal = lineSubtotal.sub(discountAmt);
        return {
          id: createId(),
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: unitPrice.toString(),
          costPrice: item.costPrice,
          discountRate: discountRate.toString(),
          taxRate: '0',
          totalPrice: lineTotal.toString(),
          serialNumbers: serialId ? [serialId] : [],
        };
      });

      // Create SalesOrder
      const createdOrder = await tx.salesOrder.create({
        data: {
          id: createId(),
          organizationId,
          reference,
          customerId: dto.customerId,
          locationId: session.locationId,
          userId,
          status: OrderStatus.COMPLETED,
          channel: 'POS',
          currency: 'NGN',
          subtotal: subtotal.toString(),
          discountAmount: discountTotal.toString(),
          taxAmount: '0',
          totalAmount: totalAmount.toString(),
          paidAmount: totalPayments.toString(),
          notes: dto.notes,
          posSessionId: sessionId,
          completedAt: new Date(),
          items: { create: itemsData },
        },
        include: {
          items: {
            include: { product: { select: { id: true, name: true, sku: true } } },
          },
          customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      });

      // Link soldOrderId on claimed units
      for (const [unitId] of serializedUnitsMap) {
        await tx.serializedUnit.update({
          where: { id: unitId },
          data: { soldOrderId: createdOrder.id },
        });
      }

      // Record payments
      for (const payment of dto.payments) {
        const payRef = generateReference('PAY');
        await tx.payment.create({
          data: {
            id: createId(),
            organizationId,
            reference: payRef,
            orderId: createdOrder.id,
            customerId: dto.customerId,
            amount: payment.amount,
            method: payment.method,
            status: PaymentStatus.COMPLETED,
            receivedAt: new Date(),
          },
        });
      }

      // Deduct inventory (passes tx so movements join the same transaction)
      for (const item of dto.items) {
        await this.inventoryService.recordMovement(organizationId, {
          productId: item.productId,
          variantId: item.variantId,
          locationId: session.locationId,
          type: MovementType.SALE,
          quantity: -item.quantity,
          referenceType: 'SalesOrder',
          referenceId: createdOrder.id,
          notes: `POS Sale: ${reference}`,
          createdBy: userId,
        }, tx);
      }

      // Update session totals
      await tx.pOSSession.update({
        where: { id: sessionId },
        data: { totalSales: { increment: totalAmount } },
      });

      // Update customer stats
      if (dto.customerId) {
        const loyaltyPoints = Math.floor(parseFloat(totalAmount.toString()) / 100);
        await tx.customer.update({
          where: { id: dto.customerId },
          data: {
            totalSpent: { increment: totalAmount },
            loyaltyPoints: { increment: loyaltyPoints },
          },
        });
      }

      return createdOrder;
    });

    return {
      order,
      receipt: {
        reference,
        items: order.items,
        subtotal: subtotal.toString(),
        discount: discountTotal.toString(),
        total: totalAmount.toString(),
        payments: dto.payments,
        change: totalPayments.gt(totalAmount)
          ? totalPayments.sub(totalAmount).toString()
          : '0',
        customer: order.customer,
        timestamp: new Date().toISOString(),
      },
    };
  }

  async getSessionSummary(organizationId: string, sessionId: string) {
    const session = await this.prisma.pOSSession.findFirst({
      where: { id: sessionId, organizationId },
      include: {
        location: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException('POS session not found');

    const orders = await this.prisma.salesOrder.findMany({
      where: { organizationId, posSessionId: sessionId },
      include: {
        payments: { select: { method: true, amount: true } },
        _count: { select: { items: true } },
      },
    });

    const totalSales = orders.reduce(
      (sum, o) => sum + parseFloat(o.totalAmount.toString()),
      0,
    );
    const totalTransactions = orders.length;

    // Payment breakdown by method
    const paymentBreakdown: Record<string, number> = {};
    for (const order of orders) {
      for (const payment of order.payments) {
        const method = payment.method;
        paymentBreakdown[method] =
          (paymentBreakdown[method] ?? 0) + parseFloat(payment.amount.toString());
      }
    }

    return {
      session,
      totalSales,
      totalTransactions,
      paymentBreakdown,
      orders: orders.map((o) => ({
        id: o.id,
        reference: o.reference,
        totalAmount: o.totalAmount.toString(),
        status: o.status,
        itemCount: o._count.items,
        createdAt: o.createdAt,
      })),
    };
  }
}
