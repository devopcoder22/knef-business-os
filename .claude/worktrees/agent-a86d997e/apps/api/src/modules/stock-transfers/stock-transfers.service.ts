import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { TransferStatus, MovementType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import type { CreateStockTransferDto, StockTransferItemDto } from './dto/create-stock-transfer.dto';
import type { ReceivedItemDto } from './dto/receive-transfer.dto';

@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(
    organizationId: string,
    query: { page?: number; limit?: number },
    locationIds: string[] | null = null,
  ) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    // Show transfers where user has access to either the source or destination location
    if (locationIds !== null) {
      where['OR'] = [
        { fromLocationId: { in: locationIds } },
        { toLocationId: { in: locationIds } },
      ];
    }

    const [transfers, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        skip,
        take: limit,
        include: {
          fromLocation: { select: { id: true, name: true, code: true } },
          toLocation: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    return {
      data: transfers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string, locationIds: string[] | null = null) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, organizationId },
      include: {
        fromLocation: { select: { id: true, name: true, code: true } },
        toLocation: { select: { id: true, name: true, code: true } },
        items: true,
      },
    });
    if (!transfer) throw new NotFoundException('Stock transfer not found');
    // IDOR: user must have access to at least one of the involved locations
    if (locationIds !== null) {
      const hasAccess =
        locationIds.includes(transfer.fromLocationId) ||
        locationIds.includes(transfer.toLocationId);
      if (!hasAccess) throw new NotFoundException('Stock transfer not found');
    }
    return transfer;
  }

  async create(
    organizationId: string,
    dto: CreateStockTransferDto,
    userId: string,
    locationIds: string[] | null = null,
  ) {
    if (dto.fromLocationId === dto.toLocationId) {
      throw new BadRequestException('Source and destination locations cannot be the same');
    }

    // Location gate: user must be authorized for BOTH source and destination
    if (locationIds !== null) {
      if (!locationIds.includes(dto.fromLocationId)) {
        throw new ForbiddenException('Not authorized for source location');
      }
      if (!locationIds.includes(dto.toLocationId)) {
        throw new ForbiddenException('Not authorized for destination location');
      }
    }

    const [fromLoc, toLoc] = await Promise.all([
      this.prisma.location.findFirst({ where: { id: dto.fromLocationId, organizationId } }),
      this.prisma.location.findFirst({ where: { id: dto.toLocationId, organizationId } }),
    ]);
    if (!fromLoc) throw new NotFoundException('Source location not found');
    if (!toLoc) throw new NotFoundException('Destination location not found');

    const reference = await this.generateReference(organizationId);

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        id: createId(),
        organizationId,
        reference,
        fromLocationId: dto.fromLocationId,
        toLocationId: dto.toLocationId,
        notes: dto.notes,
        requestedBy: userId,
        status: TransferStatus.DRAFT,
      },
    });

    if (dto.items && dto.items.length > 0) {
      await this.addItems(organizationId, transfer.id, dto.items);
    }

    return this.findOne(organizationId, transfer.id);
  }

  async addItems(
    organizationId: string,
    transferId: string,
    items: StockTransferItemDto[],
    locationIds: string[] | null = null,
  ) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, organizationId },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== TransferStatus.DRAFT) {
      throw new BadRequestException('Can only add items to DRAFT transfers');
    }
    if (locationIds !== null) {
      if (!locationIds.includes(transfer.fromLocationId) || !locationIds.includes(transfer.toLocationId)) {
        throw new ForbiddenException('Not authorized for this transfer');
      }
    }

    const created = await Promise.all(
      items.map((item) =>
        this.prisma.stockTransferItem.create({
          data: {
            id: createId(),
            transferId,
            productId: item.productId,
            variantId: item.variantId,
            quantityRequested: item.quantityRequested,
            notes: item.notes,
          },
        }),
      ),
    );

    return created;
  }

  async submit(organizationId: string, transferId: string, userId: string, locationIds: string[] | null = null) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, organizationId },
      include: { items: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (locationIds !== null) {
      if (!locationIds.includes(transfer.fromLocationId) || !locationIds.includes(transfer.toLocationId)) {
        throw new ForbiddenException('Not authorized for this transfer');
      }
    }
    if (transfer.status !== TransferStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT transfers can be submitted');
    }
    if (transfer.items.length === 0) {
      throw new BadRequestException('Cannot submit a transfer with no items');
    }

    return this.prisma.stockTransfer.update({
      where: { id: transferId },
      data: { status: TransferStatus.PENDING },
    });
  }

  async approve(organizationId: string, transferId: string, userId: string, locationIds: string[] | null = null) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, organizationId },
      include: { items: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (locationIds !== null) {
      if (!locationIds.includes(transfer.fromLocationId) || !locationIds.includes(transfer.toLocationId)) {
        throw new ForbiddenException('Not authorized for this transfer');
      }
    }
    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException('Only PENDING transfers can be approved');
    }

    // Reserve stock at source location
    for (const item of transfer.items) {
      const level = await this.prisma.inventoryLevel.findFirst({
        where: {
          productId: item.productId,
          variantId: item.variantId ?? null,
          locationId: transfer.fromLocationId,
        },
      });

      const available = (level?.quantity ?? 0) - (level?.reserved ?? 0);
      if (available < item.quantityRequested) {
        throw new BadRequestException(
          `Insufficient stock for product ${item.productId}: available ${available}, requested ${item.quantityRequested}`,
        );
      }

      if (level) {
        await this.prisma.inventoryLevel.update({
          where: { id: level.id },
          data: { reserved: { increment: item.quantityRequested } },
        });
      }
    }

    const updated = await this.prisma.stockTransfer.update({
      where: { id: transferId },
      data: {
        status: TransferStatus.IN_TRANSIT,
        approvedBy: userId,
        shippedAt: new Date(),
      },
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: 'TRANSFER_APPROVED',
      entity: 'StockTransfer',
      entityId: transferId,
      newValues: { reference: transfer.reference },
    });

    return updated;
  }

  async receive(
    organizationId: string,
    transferId: string,
    receivedItems: ReceivedItemDto[],
    userId: string,
    locationIds: string[] | null = null,
  ) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, organizationId },
      include: { items: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (locationIds !== null) {
      if (!locationIds.includes(transfer.fromLocationId) || !locationIds.includes(transfer.toLocationId)) {
        throw new ForbiddenException('Not authorized for this transfer');
      }
    }
    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException('Only IN_TRANSIT transfers can be received');
    }

    for (const received of receivedItems) {
      const transferItem = transfer.items.find((i) => i.id === received.transferItemId);
      if (!transferItem) continue;

      const qtyReceived = received.quantityReceived;
      if (qtyReceived <= 0) continue;

      // Release reservation at source before recording movement
      const sourceLevel = await this.prisma.inventoryLevel.findFirst({
        where: {
          productId: transferItem.productId,
          variantId: transferItem.variantId ?? null,
          locationId: transfer.fromLocationId,
        },
      });
      if (sourceLevel) {
        await this.prisma.inventoryLevel.update({
          where: { id: sourceLevel.id },
          data: {
            reserved: { decrement: Math.min(transferItem.quantityRequested, qtyReceived) },
          },
        });
      }

      // Record TRANSFER_OUT movement at source (recordMovement handles quantity update)
      await this.inventoryService.recordMovement(organizationId, {
        productId: transferItem.productId,
        variantId: transferItem.variantId ?? undefined,
        locationId: transfer.fromLocationId,
        type: MovementType.TRANSFER_OUT,
        quantity: -qtyReceived,
        referenceType: 'StockTransfer',
        referenceId: transferId,
        notes: `Transfer ${transfer.reference}`,
        createdBy: userId,
      });

      // Record TRANSFER_IN movement at destination
      await this.inventoryService.recordMovement(organizationId, {
        productId: transferItem.productId,
        variantId: transferItem.variantId ?? undefined,
        locationId: transfer.toLocationId,
        type: MovementType.TRANSFER_IN,
        quantity: qtyReceived,
        referenceType: 'StockTransfer',
        referenceId: transferId,
        notes: `Transfer ${transfer.reference}`,
        createdBy: userId,
      });

      // Update transfer item quantities
      await this.prisma.stockTransferItem.update({
        where: { id: received.transferItemId },
        data: {
          quantitySent: transferItem.quantityRequested,
          quantityReceived: qtyReceived,
          notes: received.notes,
        },
      });
    }

    const updated = await this.prisma.stockTransfer.update({
      where: { id: transferId },
      data: { status: TransferStatus.RECEIVED, receivedAt: new Date() },
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: 'TRANSFER_RECEIVED',
      entity: 'StockTransfer',
      entityId: transferId,
      newValues: { reference: transfer.reference },
    });

    return updated;
  }

  async cancel(organizationId: string, transferId: string, userId: string, locationIds: string[] | null = null) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, organizationId },
      include: { items: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (locationIds !== null) {
      if (!locationIds.includes(transfer.fromLocationId) || !locationIds.includes(transfer.toLocationId)) {
        throw new ForbiddenException('Not authorized for this transfer');
      }
    }

    if (
      transfer.status === TransferStatus.RECEIVED ||
      transfer.status === TransferStatus.CANCELLED
    ) {
      throw new BadRequestException('Cannot cancel a completed or already-cancelled transfer');
    }

    // Release reservations if in transit
    if (transfer.status === TransferStatus.IN_TRANSIT) {
      for (const item of transfer.items) {
        const level = await this.prisma.inventoryLevel.findFirst({
          where: {
            productId: item.productId,
            variantId: item.variantId ?? null,
            locationId: transfer.fromLocationId,
          },
        });
        if (level) {
          await this.prisma.inventoryLevel.update({
            where: { id: level.id },
            data: { reserved: { decrement: item.quantityRequested } },
          });
        }
      }
    }

    return this.prisma.stockTransfer.update({
      where: { id: transferId },
      data: { status: TransferStatus.CANCELLED },
    });
  }

  private async generateReference(organizationId: string): Promise<string> {
    const count = await this.prisma.stockTransfer.count({ where: { organizationId } });
    const seq = String(count + 1).padStart(6, '0');
    return `TRF${seq}`;
  }
}
