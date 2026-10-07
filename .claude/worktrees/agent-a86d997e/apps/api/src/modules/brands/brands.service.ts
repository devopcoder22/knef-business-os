import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateBrandDto } from './dto/create-brand.dto';
import type { UpdateBrandDto } from './dto/update-brand.dto';
import type { ListBrandsDto } from './dto/list-brands.dto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, query: ListBrandsDto) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (search) {
      where['OR'] = [
        { name: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [brands, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        skip,
        take: limit,
        include: { _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.brand.count({ where }),
    ]);

    return {
      data: brands,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(organizationId: string, id: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async create(organizationId: string, dto: CreateBrandDto, _userId: string) {
    const slug = await this.generateUniqueSlug(organizationId, dto.name);

    return this.prisma.brand.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        slug,
        logoUrl: dto.logoUrl,
        website: dto.website,
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateBrandDto,
    _userId: string,
  ) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, organizationId },
    });
    if (!brand) throw new NotFoundException('Brand not found');

    let slug = brand.slug;
    if (dto.name && dto.name !== brand.name) {
      slug = await this.generateUniqueSlug(organizationId, dto.name, id);
    }

    return this.prisma.brand.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        logoUrl: dto.logoUrl,
        website: dto.website,
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException('Brand not found');

    if (brand._count.products > 0) {
      throw new BadRequestException(
        `Cannot delete brand: ${brand._count.products} product(s) are assigned to it`,
      );
    }

    await this.prisma.brand.delete({ where: { id } });
    return { message: 'Brand deleted successfully' };
  }

  private async generateUniqueSlug(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.brand.findFirst({
        where: {
          organizationId,
          slug,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
      });
      if (!existing) break;
      slug = `${base}-${counter++}`;
    }

    return slug;
  }
}
