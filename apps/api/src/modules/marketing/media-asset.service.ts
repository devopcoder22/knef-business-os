import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'image/svg+xml', 'video/mp4', 'video/webm', 'application/pdf',
];

const VALID_CATEGORIES = [
  'PRODUCT_IMAGE', 'CAMPAIGN_IMAGE', 'VIDEO', 'LOGO', 'DOCUMENT',
] as const;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export interface CreateMediaAssetDto {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  url: string;
  altText?: string;
  tags?: string[];
  category?: string;
}

export interface UpdateMediaAssetDto {
  altText?: string;
  tags?: string[];
  category?: string;
}

@Injectable()
export class MediaAssetService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    query: { category?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 24));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { organizationId, isActive: true };
    if (query.category) where['category'] = query.category;

    const [items, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getById(organizationId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!asset) throw new NotFoundException('Media asset not found');
    return asset;
  }

  async create(organizationId: string, dto: CreateMediaAssetDto, userId: string) {
    this.validateMimeType(dto.mimeType);
    this.validateFileSize(dto.size);

    if (dto.category && !VALID_CATEGORIES.includes(dto.category as typeof VALID_CATEGORIES[number])) {
      throw new BadRequestException(`Invalid category: ${dto.category}`);
    }

    return this.prisma.mediaAsset.create({
      data: {
        id: createId(),
        organizationId,
        uploadedById: userId,
        filename: dto.filename,
        originalName: dto.originalName,
        mimeType: dto.mimeType,
        size: dto.size,
        width: dto.width ?? null,
        height: dto.height ?? null,
        url: dto.url,
        altText: dto.altText ?? null,
        tags: dto.tags ?? [],
        category: dto.category ?? 'CAMPAIGN_IMAGE',
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateMediaAssetDto) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!asset) throw new NotFoundException('Media asset not found');

    if (dto.category && !VALID_CATEGORIES.includes(dto.category as typeof VALID_CATEGORIES[number])) {
      throw new BadRequestException(`Invalid category: ${dto.category}`);
    }

    return this.prisma.mediaAsset.update({
      where: { id },
      data: {
        ...(dto.altText !== undefined && { altText: dto.altText }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.category !== undefined && { category: dto.category }),
      },
    });
  }

  async delete(organizationId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, organizationId },
    });
    if (!asset) throw new NotFoundException('Media asset not found');

    await this.prisma.mediaAsset.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Media asset deleted' };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private validateMimeType(mimeType: string) {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }
  }

  private validateFileSize(size: number) {
    if (size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }
  }
}
