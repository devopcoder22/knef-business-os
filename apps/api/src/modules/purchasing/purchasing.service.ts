import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { POStatus, InvoiceStatus, MovementType, ReturnStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { BusinessRuleService } from '../business-rules/business-rules.service';
import { AuditService } from '../audit/audit.service';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import type { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import type { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import type { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import type { RecordSupplierPaymentDto } from './dto/record-supplier-payment.dto';
import type { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';

function generateReference(prefix: string): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${dateStr}-${rand}`;
}

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly businessRuleService: BusinessRuleService,
    private readonly auditService: AuditService,
  ) {}

  // ── Purchase Orders ───────────────────────────────────────────

  async listPurchaseOrders(organizationId: string, query: ListPurchaseOrdersDto, locationIds: string[] | null = null) {
    const { page = 1, limit = 20, status, supplierId, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (locationIds !== null) {
      where['locationId'] = { in: locationIds };
    }
    if (status) where['status'] = status;
    if (supplierId) where['supplierId'] = supplierId;
    if (search) {
      where['OR'] = [
        { reference: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
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
          expectedDate: true,
          createdAt: true,
          supplier: { select: { id: true, name: true, code: true } },
          location: { select: { id: true, name: true } },
          _count: { select: { items: true, receipts: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data: orders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findPurchaseOrder(organizationId: string, id: string, locationIds: string[] | null = null) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        location: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
        receipts: {
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        },
        invoices: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (locationIds !== null && !locationIds.includes(order.locationId)) {
      throw new NotFoundException('Purchase order not found');
    }
    return order;
  }

  async createPurchaseOrder(
    organizationId: string,
    dto: CreatePurchaseOrderDto,
    userId: string,
    locationIds: string[] | null = null,
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Purchase order must have at least one item');
    }
    if (locationIds !== null && dto.locationId) {
      if (!locationIds.includes(dto.locationId)) {
        throw new ForbiddenException('Not authorized to create purchase orders for this location');
      }
    }

    const reference = generateReference('PO');

    // Calculate totals server-side
    let subtotal = new Prisma.Decimal(0);
    const itemsData = dto.items.map((item) => {
      const unitCost = new Prisma.Decimal(item.unitCost);
      const taxRate = new Prisma.Decimal(item.taxRate ?? '0');
      const discountRate = new Prisma.Decimal(item.discountRate ?? '0');
      const lineTotal = unitCost
        .mul(item.quantity)
        .mul(new Prisma.Decimal(1).add(taxRate.div(100)))
        .mul(new Prisma.Decimal(1).sub(discountRate.div(100)));
      subtotal = subtotal.add(unitCost.mul(item.quantity));
      return {
        id: createId(),
        productId: item.productId,
        variantId: item.variantId,
        description: item.description,
        quantity: item.quantity,
        receivedQty: 0,
        unitCost: unitCost.toString(),
        taxRate: taxRate.toString(),
        discountRate: discountRate.toString(),
        totalCost: lineTotal.toString(),
        notes: item.notes,
      };
    });

    const shippingCost = new Prisma.Decimal(dto.shippingCost ?? '0');
    const discountAmount = new Prisma.Decimal(dto.discountAmount ?? '0');
    const totalAmount = subtotal.add(shippingCost).sub(discountAmount);

    const po = await this.prisma.purchaseOrder.create({
      data: {
        id: createId(),
        organizationId,
        reference,
        supplierId: dto.supplierId,
        locationId: dto.locationId,
        status: POStatus.DRAFT,
        currency: dto.currency ?? 'NGN',
        subtotal: subtotal.toString(),
        taxAmount: '0',
        shippingCost: shippingCost.toString(),
        discountAmount: discountAmount.toString(),
        totalAmount: totalAmount.toString(),
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        notes: dto.notes,
        internalNotes: dto.internalNotes,
        createdBy: userId,
        items: { create: itemsData },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });

    this.eventEmitter.emit('purchase_order.created', {
      organizationId,
      purchaseOrderId: po.id,
      reference: po.reference,
      supplierId: po.supplierId,
      totalAmount: po.totalAmount.toString(),
      locationId: po.locationId,
      actorUserId: userId,
    });

    return po;
  }

  async updatePurchaseOrder(
    organizationId: string,
    id: string,
    dto: Partial<CreatePurchaseOrderDto>,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (order.status !== POStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be updated');
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        notes: dto.notes,
        internalNotes: dto.internalNotes,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        shippingCost: dto.shippingCost,
        discountAmount: dto.discountAmount,
      },
    });
  }

  async submitPurchaseOrder(organizationId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (order.status !== POStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be submitted');
    }

    const submitted = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.SUBMITTED },
    });

    const ruleCheck = await this.businessRuleService.checkPurchaseAmount(
      organizationId,
      Number(order.totalAmount),
    );

    return { ...submitted, ruleCheck };
  }

  async approvePurchaseOrder(
    organizationId: string,
    id: string,
    userId: string,
    approverLocationIds: string[] | null = null,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!order) throw new NotFoundException('Purchase order not found');

    // Idempotency: if already approved return existing state
    if (order.status === POStatus.APPROVED) {
      const ruleCheck = await this.businessRuleService.checkPurchaseAmount(
        organizationId,
        Number(order.totalAmount),
      );
      return { ...order, ruleCheck, idempotent: true };
    }

    if (order.status !== POStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED orders can be approved');
    }

    // Self-approval prevention
    if (order.createdBy && userId === order.createdBy) {
      throw new ForbiddenException('Cannot approve your own purchase order');
    }

    // Approver location scope check
    if (approverLocationIds !== null && !approverLocationIds.includes(order.locationId)) {
      throw new ForbiddenException('Not authorized to approve purchase orders for this location');
    }

    // Requester authority recheck — submitter must still be active in org
    if (order.createdBy) {
      const requester = await this.prisma.user.findFirst({
        where: { id: order.createdBy, organizationId, isActive: true },
        select: { id: true },
      });
      if (!requester) {
        throw new ForbiddenException('Requester is no longer active in this organization');
      }
    }

    // Re-evaluate rule at approval time (threshold may have changed since submission)
    const ruleCheck = await this.businessRuleService.checkPurchaseAmount(
      organizationId,
      Number(order.totalAmount),
    );

    // Atomic state transition — prevent concurrent double-approval
    const result = await this.prisma.purchaseOrder.updateMany({
      where: { id, organizationId, status: POStatus.SUBMITTED },
      data: {
        status: POStatus.APPROVED,
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId } });
      if (current?.status === POStatus.APPROVED) {
        return { ...current, ruleCheck, idempotent: true };
      }
      throw new BadRequestException('Purchase order is no longer in SUBMITTED state');
    }

    const approved = await this.findPurchaseOrder(organizationId, id);

    void this.auditService.log({
      organizationId,
      userId,
      action: 'PURCHASE_ORDER_APPROVED',
      entity: 'PurchaseOrder',
      entityId: id,
      oldValues: { status: 'SUBMITTED' },
      newValues: { status: 'APPROVED', approvedBy: userId },
    });

    this.eventEmitter.emit('purchase_order.approved', {
      organizationId,
      purchaseOrderId: approved.id,
      reference: approved.reference,
      supplierId: approved.supplierId,
      totalAmount: approved.totalAmount.toString(),
      locationId: approved.locationId,
      actorUserId: userId,
    });

    return { ...approved, ruleCheck };
  }

  async cancelPurchaseOrder(
    organizationId: string,
    id: string,
    reason?: string,
    userId?: string,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (
      order.status === POStatus.RECEIVED ||
      order.status === POStatus.CLOSED ||
      order.status === POStatus.CANCELLED
    ) {
      throw new BadRequestException('Order cannot be cancelled in its current state');
    }

    const cancelled = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: POStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    void this.auditService.log({
      organizationId,
      userId,
      action: 'PURCHASE_ORDER_CANCELLED',
      entity: 'PurchaseOrder',
      entityId: id,
      oldValues: { status: order.status },
      newValues: { status: 'CANCELLED', cancelReason: reason },
    });

    return cancelled;
  }

  async deletePurchaseOrder(organizationId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (order.status !== POStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be deleted');
    }

    await this.prisma.purchaseOrder.delete({ where: { id } });
    return { message: 'Purchase order deleted' };
  }

  // ── Goods Receipts ────────────────────────────────────────────

  async listGoodsReceipts(organizationId: string, page = 1, limit = 20, locationIds: string[] | null = null) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { organizationId };
    if (locationIds !== null) {
      where['purchaseOrder'] = { locationId: { in: locationIds } };
    }

    const [receipts, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        skip,
        take: limit,
        include: {
          purchaseOrder: {
            select: {
              id: true,
              reference: true,
              supplier: { select: { id: true, name: true } },
            },
          },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);

    return {
      data: receipts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findGoodsReceipt(organizationId: string, id: string, locationIds: string[] | null = null) {
    const receipt = await this.prisma.goodsReceipt.findFirst({
      where: { id, organizationId },
      include: {
        purchaseOrder: {
          include: {
            supplier: true,
            location: { select: { id: true, name: true } },
          },
        },
        items: true,
      },
    });
    if (!receipt) throw new NotFoundException('Goods receipt not found');
    if (receipt && locationIds !== null) {
      const po = await this.prisma.purchaseOrder.findUnique({ where: { id: receipt.purchaseOrderId }, select: { locationId: true } });
      if (po && !locationIds.includes(po.locationId)) {
        throw new NotFoundException('Goods receipt not found');
      }
    }
    return receipt;
  }

  async createGoodsReceipt(
    organizationId: string,
    dto: CreateGoodsReceiptDto,
    userId: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, organizationId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (
      po.status !== POStatus.APPROVED &&
      po.status !== POStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestException(
        'Purchase order must be APPROVED or PARTIALLY_RECEIVED to receive goods',
      );
    }

    const reference = generateReference('GR');

    const receipt = await this.prisma.$transaction(async (tx) => {
      const gr = await tx.goodsReceipt.create({
        data: {
          id: createId(),
          organizationId,
          reference,
          purchaseOrderId: dto.purchaseOrderId,
          locationId: po.locationId,
          receivedBy: userId,
          notes: dto.notes,
          items: {
            create: dto.items.map((item) => ({
              id: createId(),
              productId: item.productId,
              variantId: item.variantId,
              quantityOrdered:
                po.items.find((i) => i.productId === item.productId)?.quantity ?? 0,
              quantityReceived: item.quantityReceived,
              unitCost: item.unitCost,
              notes: item.notes,
            })),
          },
        },
        include: { items: true },
      });

      // Update PO item received quantities
      for (const item of dto.items) {
        await tx.purchaseOrderItem.updateMany({
          where: {
            purchaseOrderId: dto.purchaseOrderId,
            productId: item.productId,
            ...(item.variantId ? { variantId: item.variantId } : {}),
          },
          data: {
            receivedQty: {
              increment: item.quantityReceived,
            },
          },
        });
      }

      // Determine new PO status
      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: dto.purchaseOrderId },
      });
      const allReceived = updatedItems.every((i) => i.receivedQty >= i.quantity);
      const anyReceived = updatedItems.some((i) => i.receivedQty > 0);

      await tx.purchaseOrder.update({
        where: { id: dto.purchaseOrderId },
        data: {
          status: allReceived
            ? POStatus.RECEIVED
            : anyReceived
            ? POStatus.PARTIALLY_RECEIVED
            : po.status,
        },
      });

      return gr;
    });

    // Record inventory movements (after transaction)
    for (const item of dto.items) {
      await this.inventoryService.recordMovement(organizationId, {
        productId: item.productId,
        variantId: item.variantId,
        locationId: po.locationId,
        type: MovementType.PURCHASE_RECEIPT,
        quantity: item.quantityReceived,
        referenceType: 'GoodsReceipt',
        referenceId: receipt.id,
        notes: `Received via ${reference}`,
        createdBy: userId,
      });
    }

    return receipt;
  }

  // ── Supplier Invoices ─────────────────────────────────────────

  async listSupplierInvoices(organizationId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { organizationId };

    const [invoices, total] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplierInvoice.count({ where }),
    ]);

    return {
      data: invoices,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findSupplierInvoice(organizationId: string, id: string) {
    const invoice = await this.prisma.supplierInvoice.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        purchaseOrder: { select: { id: true, reference: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');
    return invoice;
  }

  async createSupplierInvoice(organizationId: string, dto: CreateSupplierInvoiceDto) {
    // Check uniqueness
    const existing = await this.prisma.supplierInvoice.findFirst({
      where: { organizationId, invoiceNumber: dto.invoiceNumber },
    });
    if (existing) {
      throw new BadRequestException(`Invoice number '${dto.invoiceNumber}' already exists`);
    }

    return this.prisma.supplierInvoice.create({
      data: {
        id: createId(),
        organizationId,
        supplierId: dto.supplierId,
        purchaseOrderId: dto.purchaseOrderId,
        invoiceNumber: dto.invoiceNumber,
        amount: dto.amount,
        paidAmount: '0',
        currency: dto.currency ?? 'NGN',
        status: InvoiceStatus.UNPAID,
        invoiceDate: new Date(dto.invoiceDate),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
      },
    });
  }

  async recordSupplierPayment(
    organizationId: string,
    invoiceId: string,
    dto: RecordSupplierPaymentDto,
  ) {
    const invoice = await this.prisma.supplierInvoice.findFirst({
      where: { id: invoiceId, organizationId },
    });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot record payment for a cancelled invoice');
    }

    const paymentAmount = new Prisma.Decimal(dto.amount);
    const newPaidAmount = new Prisma.Decimal(invoice.paidAmount.toString()).add(paymentAmount);

    let newStatus: InvoiceStatus;
    if (newPaidAmount.gte(invoice.amount)) {
      newStatus = InvoiceStatus.PAID;
    } else if (newPaidAmount.gt(0)) {
      newStatus = InvoiceStatus.PARTIAL;
    } else {
      newStatus = invoice.status;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.supplierPayment.create({
        data: {
          id: createId(),
          organizationId,
          supplierId: invoice.supplierId,
          invoiceId,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          notes: dto.notes,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        },
      });

      await tx.supplierInvoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount.toString(),
          status: newStatus,
        },
      });
    });

    return this.findSupplierInvoice(organizationId, invoiceId);
  }

  // ── Purchase Returns ──────────────────────────────────────────

  async listPurchaseReturns(organizationId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { organizationId };

    const [returns, total] = await Promise.all([
      this.prisma.purchaseReturn.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseReturn.count({ where }),
    ]);

    return {
      data: returns,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findPurchaseReturn(organizationId: string, id: string) {
    const ret = await this.prisma.purchaseReturn.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        purchaseOrder: { select: { id: true, reference: true } },
        items: true,
      },
    });
    if (!ret) throw new NotFoundException('Purchase return not found');
    return ret;
  }

  async createPurchaseReturn(
    organizationId: string,
    dto: CreatePurchaseReturnDto,
    userId: string,
  ) {
    const reference = generateReference('PR');

    // Calculate total
    const totalAmount = dto.items.reduce((sum, item) => {
      return sum.add(new Prisma.Decimal(item.unitCost).mul(item.quantity));
    }, new Prisma.Decimal(0));

    return this.prisma.purchaseReturn.create({
      data: {
        id: createId(),
        organizationId,
        reference,
        supplierId: dto.supplierId,
        purchaseOrderId: dto.purchaseOrderId,
        reason: dto.reason,
        totalAmount: totalAmount.toString(),
        status: ReturnStatus.DRAFT,
        notes: dto.notes,
        createdBy: userId,
        items: {
          create: dto.items.map((item) => ({
            id: createId(),
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            totalCost: new Prisma.Decimal(item.unitCost).mul(item.quantity).toString(),
            reason: item.reason,
          })),
        },
      },
      include: { items: true },
    });
  }

  async approvePurchaseReturn(organizationId: string, id: string) {
    const ret = await this.prisma.purchaseReturn.findFirst({
      where: { id, organizationId },
    });
    if (!ret) throw new NotFoundException('Purchase return not found');
    if (ret.status !== ReturnStatus.DRAFT && ret.status !== ReturnStatus.SUBMITTED) {
      throw new BadRequestException('Return must be DRAFT or SUBMITTED to approve');
    }

    return this.prisma.purchaseReturn.update({
      where: { id },
      data: { status: ReturnStatus.APPROVED },
    });
  }

  async completePurchaseReturn(
    organizationId: string,
    id: string,
    userId: string,
  ) {
    const ret = await this.prisma.purchaseReturn.findFirst({
      where: { id, organizationId },
      include: {
        items: true,
        purchaseOrder: { select: { locationId: true } },
      },
    });
    if (!ret) throw new NotFoundException('Purchase return not found');
    if (ret.status !== ReturnStatus.APPROVED) {
      throw new BadRequestException('Return must be APPROVED to complete');
    }

    // We need a locationId — use PO location or first location
    const locationId =
      ret.purchaseOrder?.locationId ??
      (
        await this.prisma.location.findFirst({
          where: { organizationId, isActive: true },
          select: { id: true },
        })
      )?.id;

    if (!locationId) {
      throw new BadRequestException('No location found for return');
    }

    await this.prisma.purchaseReturn.update({
      where: { id },
      data: { status: ReturnStatus.COMPLETED },
    });

    // Record inventory movements
    for (const item of ret.items) {
      await this.inventoryService.recordMovement(organizationId, {
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        locationId,
        type: MovementType.RETURN_OUT,
        quantity: -item.quantity,
        referenceType: 'PurchaseReturn',
        referenceId: id,
        notes: `Return to supplier: ${ret.reason}`,
        createdBy: userId,
      });
    }

    return this.findPurchaseReturn(organizationId, id);
  }
}
