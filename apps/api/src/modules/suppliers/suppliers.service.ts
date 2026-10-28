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

  // ── Supplier Ledger ───────────────────────────────────────────

  async getLedger(
    organizationId: string,
    supplierId: string,
    query: { page?: number; limit?: number; from?: string; to?: string },
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
      select: { id: true, name: true, code: true, currency: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const { page = 1, limit = 50, from, to } = query;
    const skip = (page - 1) * limit;
    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter['gte'] = new Date(from);
    if (to) dateFilter['lte'] = new Date(to);

    const [invoices, payments, totalInvoices, totalPayments] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where: {
          supplierId,
          organizationId,
          ...(Object.keys(dateFilter).length ? { invoiceDate: dateFilter } : {}),
        },
        select: {
          id: true,
          invoiceNumber: true,
          amount: true,
          paidAmount: true,
          status: true,
          invoiceDate: true,
          dueDate: true,
        },
        orderBy: { invoiceDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          supplierId,
          organizationId,
          ...(Object.keys(dateFilter).length ? { paidAt: dateFilter } : {}),
        },
        select: {
          id: true,
          amount: true,
          method: true,
          reference: true,
          paidAt: true,
        },
        orderBy: { paidAt: 'desc' },
        take: 100,
      }),
      this.prisma.supplierInvoice.aggregate({
        where: { supplierId, organizationId },
        _sum: { amount: true, paidAmount: true },
      }),
      this.prisma.supplierPayment.aggregate({
        where: { supplierId, organizationId },
        _sum: { amount: true },
      }),
    ]);

    const totalInvoiced = Number(totalInvoices._sum.amount ?? 0);
    const totalPaid = Number(totalPayments._sum.amount ?? 0);
    const outstanding = totalInvoiced - totalPaid;

    return {
      supplier,
      summary: { totalInvoiced, totalPaid, outstanding },
      invoices,
      payments,
      meta: { total: totalInvoices._sum.amount ?? 0, page, limit },
    };
  }

  // ── AP Aging ─────────────────────────────────────────────────

  async getApAging(organizationId: string) {
    const now = new Date();

    const unpaidInvoices = await this.prisma.supplierInvoice.findMany({
      where: {
        organizationId,
        status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
    });

    type AgingBucket = { current: number; days1_30: number; days31_60: number; days61_90: number; over90: number; total: number };
    const supplierMap = new Map<string, { supplier: { id: string; name: string; code: string }; amounts: AgingBucket }>();

    for (const inv of unpaidInvoices) {
      const outstanding = Number(inv.amount) - Number(inv.paidAmount);
      if (outstanding <= 0) continue;

      const dueDate = inv.dueDate ?? inv.invoiceDate;
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      const sid = inv.supplierId;
      if (!supplierMap.has(sid)) {
        supplierMap.set(sid, {
          supplier: inv.supplier,
          amounts: { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0, total: 0 },
        });
      }
      const entry = supplierMap.get(sid)!;
      entry.amounts.total += outstanding;
      if (daysOverdue <= 0) entry.amounts.current += outstanding;
      else if (daysOverdue <= 30) entry.amounts.days1_30 += outstanding;
      else if (daysOverdue <= 60) entry.amounts.days31_60 += outstanding;
      else if (daysOverdue <= 90) entry.amounts.days61_90 += outstanding;
      else entry.amounts.over90 += outstanding;
    }

    const rows = Array.from(supplierMap.values()).sort((a, b) => b.amounts.total - a.amounts.total);

    const totals = rows.reduce(
      (acc, r) => {
        acc.current += r.amounts.current;
        acc.days1_30 += r.amounts.days1_30;
        acc.days31_60 += r.amounts.days31_60;
        acc.days61_90 += r.amounts.days61_90;
        acc.over90 += r.amounts.over90;
        acc.total += r.amounts.total;
        return acc;
      },
      { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0, total: 0 },
    );

    return { asOf: now.toISOString(), rows, totals };
  }

  // ── Helpers ───────────────────────────────────────────────────

  private async updateSearchVector(supplierId: string) {
    try {
      await this.prisma.$executeRaw`
        UPDATE "Supplier" SET search_vector = to_tsvector('english',
          coalesce(name,'') || ' ' || coalesce(code,'') || ' ' ||
          coalesce(email,'') || ' ' || coalesce(phone,'')
        ) WHERE id = ${supplierId}
      `;
    } catch {
      // search_vector column is optional; silently skip if not present
    }
  }
}
