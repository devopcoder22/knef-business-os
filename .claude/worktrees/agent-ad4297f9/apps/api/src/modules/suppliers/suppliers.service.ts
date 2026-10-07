import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { UpdateSupplierDto } from './dto/update-supplier.dto';
import type { ListSuppliersDto } from './dto/list-suppliers.dto';
import type { CreateSupplierContactDto } from './dto/create-supplier-contact.dto';
import type { CreateSupplierPriceDto } from './dto/create-supplier-price.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, query: ListSuppliersDto) {
    const { page = 1, limit = 20, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (isActive !== undefined) where['isActive'] = isActive;
    if (search) {
      where['OR'] = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [suppliers, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          code: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          paymentTerms: true,
          currency: true,
          rating: true,
          isActive: true,
          createdAt: true,
          _count: { select: { purchaseOrders: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data: suppliers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
      include: {
        contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        prices: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { purchaseOrders: true, invoices: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async create(organizationId: string, dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: { organizationId, code: dto.code },
    });
    if (existing) throw new ConflictException(`Supplier code '${dto.code}' already exists`);

    const supplier = await this.prisma.supplier.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        taxId: dto.taxId,
        paymentTerms: dto.paymentTerms ?? 30,
        currency: dto.currency ?? 'NGN',
        bankName: dto.bankName,
        bankAccount: dto.bankAccount,
        bankCode: dto.bankCode,
        notes: dto.notes,
        rating: dto.rating,
        isActive: dto.isActive ?? true,
      },
    });

    await this.updateSearchVector(supplier.id);
    return supplier;
  }

  async update(organizationId: string, id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    if (dto.code && dto.code !== supplier.code) {
      const conflict = await this.prisma.supplier.findFirst({
        where: { organizationId, code: dto.code, NOT: { id } },
      });
      if (conflict) throw new ConflictException(`Supplier code '${dto.code}' already exists`);
    }

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code ? dto.code.toUpperCase() : undefined,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        taxId: dto.taxId,
        paymentTerms: dto.paymentTerms,
        currency: dto.currency,
        bankName: dto.bankName,
        bankAccount: dto.bankAccount,
        bankCode: dto.bankCode,
        notes: dto.notes,
        rating: dto.rating,
        isActive: dto.isActive,
      },
    });

    await this.updateSearchVector(id);
    return updated;
  }

  async softDelete(organizationId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    await this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Supplier deactivated successfully' };
  }

  // ── Contacts ──────────────────────────────────────────────────

  async addContact(organizationId: string, supplierId: string, dto: CreateSupplierContactDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    if (dto.isPrimary) {
      await this.prisma.supplierContact.updateMany({
        where: { supplierId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.supplierContact.create({
      data: {
        id: createId(),
        supplierId,
        name: dto.name,
        title: dto.title,
        email: dto.email,
        phone: dto.phone,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async removeContact(organizationId: string, supplierId: string, contactId: string) {
    const contact = await this.prisma.supplierContact.findFirst({
      where: { id: contactId, supplierId, supplier: { organizationId } },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    await this.prisma.supplierContact.delete({ where: { id: contactId } });
    return { message: 'Contact removed' };
  }

  // ── Prices ────────────────────────────────────────────────────

  async addPrice(organizationId: string, supplierId: string, dto: CreateSupplierPriceDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    // Upsert price (unique on supplierId+productId+variantId)
    return this.prisma.supplierPrice.upsert({
      where: {
        supplierId_productId_variantId: {
          supplierId,
          productId: dto.productId,
          variantId: dto.variantId as string,
        },
      },
      create: {
        id: createId(),
        supplierId,
        productId: dto.productId,
        variantId: dto.variantId,
        price: dto.price,
        currency: dto.currency ?? 'NGN',
        minQty: dto.minQty ?? 1,
        leadDays: dto.leadDays ?? 7,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
        notes: dto.notes,
      },
      update: {
        price: dto.price,
        currency: dto.currency ?? 'NGN',
        minQty: dto.minQty ?? 1,
        leadDays: dto.leadDays ?? 7,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
        notes: dto.notes,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    });
  }

  async getPrices(organizationId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    return this.prisma.supplierPrice.findMany({
      where: { supplierId },
      include: {
        product: { select: { id: true, name: true, sku: true, sellingPrice: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPurchaseHistory(organizationId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    return this.prisma.purchaseOrder.findMany({
      where: { organizationId, supplierId },
      select: {
        id: true,
        reference: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
        expectedDate: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────

  private async updateSearchVector(supplierId: string) {
    await this.prisma.$executeRaw`
      UPDATE suppliers SET search_vector = to_tsvector('english',
        coalesce(name,'') || ' ' || coalesce(code,'') || ' ' ||
        coalesce(email,'') || ' ' || coalesce(phone,'')
      ) WHERE id = ${supplierId}
    `;
  }
}
