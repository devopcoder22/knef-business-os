import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

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
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.category.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findTree(organizationId: string) {
    const all = await this.prisma.category.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    type CategoryNode = (typeof all)[number] & { children: CategoryNode[] };

    const map = new Map<string, CategoryNode>();
    all.forEach((c) => map.set(c.id, { ...c, children: [] }));

    const roots: CategoryNode[] = [];
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async findOne(organizationId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, organizationId },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: { select: { id: true, name: true, slug: true, sortOrder: true } },
        _count: { select: { products: true } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(organizationId: string, dto: CreateCategoryDto, userId: string) {
    const slug = await this.generateUniqueSlug(organizationId, dto.name);

    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, organizationId },
      });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    return this.prisma.category.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateCategoryDto,
    userId: string,
  ) {
    const category = await this.prisma.category.findFirst({
      where: { id, organizationId },
    });
    if (!category) throw new NotFoundException('Category not found');

    let slug = category.slug;
    if (dto.name && dto.name !== category.name) {
      slug = await this.generateUniqueSlug(organizationId, dto.name, id);
    }

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, organizationId },
      });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');

    if (category._count.products > 0) {
      throw new BadRequestException(
        `Cannot delete category: ${category._count.products} product(s) are assigned to it`,
      );
    }
    if (category._count.children > 0) {
      throw new BadRequestException(
        `Cannot delete category: it has ${category._count.children} sub-categor(ies). Delete or re-assign them first.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted successfully' };
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
      const existing = await this.prisma.category.findFirst({
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
