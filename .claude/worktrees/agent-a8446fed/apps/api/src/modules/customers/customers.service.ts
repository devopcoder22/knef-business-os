import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import type { ListCustomersDto } from './dto/list-customers.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, query: ListCustomersDto) {
    const { page = 1, limit = 20, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (isActive !== undefined) where['isActive'] = isActive;
    if (search) {
      where['OR'] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

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
          isActive: true,
          createdAt: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: customers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(organizationId: string, dto: CreateCustomerDto) {
    // Check phone uniqueness
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

  async getSalesHistory(organizationId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.salesOrder.findMany({
      where: { organizationId, customerId },
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

  // ── Helpers ───────────────────────────────────────────────────

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
