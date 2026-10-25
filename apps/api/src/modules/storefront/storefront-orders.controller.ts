import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import { PrismaService } from '../../common/services/prisma.service';
import type { CustomerAccountContext } from './guards/customer-jwt.guard';

function customerStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Pending',
    CONFIRMED: 'Confirmed',
    PROCESSING: 'Processing',
    COMPLETED: 'Delivered',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
    PARTIAL_REFUND: 'Partially Refunded',
  };
  return map[status] ?? status;
}

@ApiTags('storefront-orders')
@Public()
@UseGuards(CustomerJwtGuard)
@ApiBearerAuth('customer-JWT')
@Controller('storefront/orders')
export class StorefrontOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List customer orders' })
  async listOrders(
    @CurrentCustomer() customer: CustomerAccountContext,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const p = Math.max(1, parseInt(page, 10));
    const l = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip = (p - 1) * l;

    const where = { customerAccountId: customer.id };

    const [orders, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          reference: true,
          status: true,
          channel: true,
          currency: true,
          subtotal: true,
          deliveryFee: true,
          totalAmount: true,
          createdAt: true,
          completedAt: true,
          deliveryAddress: true,
          deliveryCity: true,
          deliveryState: true,
          deliveryLandmark: true,
          deliveryCountry: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      data: orders.map((o) => ({
        reference: o.reference,
        status: customerStatusLabel(o.status),
        currency: o.currency,
        subtotal: o.subtotal.toString(),
        deliveryFee: o.deliveryFee.toString(),
        totalAmount: o.totalAmount.toString(),
        itemCount: o._count.items,
        createdAt: o.createdAt,
        completedAt: o.completedAt,
        deliveryAddress: o.deliveryAddress,
        deliveryCity: o.deliveryCity,
        deliveryState: o.deliveryState,
      })),
      meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) },
    };
  }

  @Get(':reference')
  @ApiOperation({ summary: 'Get customer order detail' })
  async getOrder(
    @CurrentCustomer() customer: CustomerAccountContext,
    @Param('reference') reference: string,
  ) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { reference, customerAccountId: customer.id }, // strict ownership
      select: {
        reference: true,
        status: true,
        currency: true,
        subtotal: true,
        discountAmount: true,
        taxAmount: true,
        deliveryFee: true,
        totalAmount: true,
        notes: true,
        deliveryAddress: true,
        deliveryCity: true,
        deliveryState: true,
        deliveryPhone: true,
        deliveryLandmark: true,
        deliveryCountry: true,
        deliveryPlaceId: true,
        deliveryLatitude: true,
        deliveryLongitude: true,
        deliveryAddressSource: true,
        createdAt: true,
        completedAt: true,
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            discountRate: true,
            taxRate: true,
            totalPrice: true,
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    return {
      reference: order.reference,
      status: customerStatusLabel(order.status),
      currency: order.currency,
      subtotal: order.subtotal.toString(),
      discountAmount: order.discountAmount.toString(),
      taxAmount: order.taxAmount.toString(),
      deliveryFee: order.deliveryFee.toString(),
      totalAmount: order.totalAmount.toString(),
      notes: order.notes,
      deliveryAddress: order.deliveryAddress,
      deliveryCity: order.deliveryCity,
      deliveryState: order.deliveryState,
      deliveryPhone: order.deliveryPhone,
      deliveryLandmark: order.deliveryLandmark,
      deliveryCountry: order.deliveryCountry,
      deliveryPlaceId: order.deliveryPlaceId,
      deliveryLatitude: order.deliveryLatitude?.toString() ?? null,
      deliveryLongitude: order.deliveryLongitude?.toString() ?? null,
      deliveryAddressSource: order.deliveryAddressSource,
      createdAt: order.createdAt,
      completedAt: order.completedAt,
      items: order.items.map((i) => ({
        id: i.id,
        product: i.product,
        variant: i.variant,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toString(),
        discountRate: i.discountRate.toString(),
        taxRate: i.taxRate.toString(),
        totalPrice: i.totalPrice.toString(),
      })),
    };
  }
}
