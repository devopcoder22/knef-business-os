import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface CreateTestimonialDto {
  customerName: string;
  quote: string;
  rating?: number | null;
  location?: string | null;
  productName?: string | null;
  avatarUrl?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateTestimonialDto {
  customerName?: string;
  quote?: string;
  rating?: number | null;
  location?: string | null;
  productName?: string | null;
  avatarUrl?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class TestimonialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Strip dangerous HTML from user-supplied text.
   * React handles XSS escaping on the frontend; these guards catch
   * anything stored raw (e.g. PDF generation, server-side rendering).
   */
  private sanitizeText(input: string): string {
    return input
      // Remove <script ...>...</script> blocks (including multiline)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      // Remove <iframe ...>...</iframe> blocks
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      // Strip inline event handlers (on* = "...") in any tag
      .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '');
  }

  private validateRating(rating: number | null | undefined): void {
    if (rating === null || rating === undefined) return;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }
  }

  // ── Public methods ───────────────────────────────────────────────────────────

  async list(organizationId: string) {
    const data = await (this.prisma as any).storefrontTestimonial.findMany({
      where: { organizationId },
      orderBy: { displayOrder: 'asc' },
    });
    return { data };
  }

  async create(organizationId: string, dto: CreateTestimonialDto, userId: string) {
    if (!dto.customerName?.trim()) {
      throw new BadRequestException('customerName is required');
    }
    if (!dto.quote?.trim()) {
      throw new BadRequestException('quote is required');
    }

    this.validateRating(dto.rating);

    const testimonial = await (this.prisma as any).storefrontTestimonial.create({
      data: {
        id: createId(),
        organizationId,
        customerName: this.sanitizeText(dto.customerName.trim()),
        quote: this.sanitizeText(dto.quote.trim()),
        rating: dto.rating ?? null,
        location: dto.location ? this.sanitizeText(dto.location) : null,
        productName: dto.productName ? this.sanitizeText(dto.productName) : null,
        avatarUrl: dto.avatarUrl ?? null,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'TESTIMONIAL_CREATED',
      entity: 'StorefrontTestimonial',
      entityId: testimonial.id,
      newValues: { customerName: testimonial.customerName, isActive: testimonial.isActive },
    });

    return { data: testimonial };
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateTestimonialDto,
    userId: string,
  ) {
    const existing = await (this.prisma as any).storefrontTestimonial.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException(`Testimonial '${id}' not found`);
    }

    if (dto.rating !== undefined) {
      this.validateRating(dto.rating);
    }

    const updateData: Record<string, unknown> = { updatedBy: userId };

    if (dto.customerName !== undefined) {
      updateData['customerName'] = this.sanitizeText(dto.customerName.trim());
    }
    if (dto.quote !== undefined) {
      updateData['quote'] = this.sanitizeText(dto.quote.trim());
    }
    if (dto.rating !== undefined) updateData['rating'] = dto.rating;
    if (dto.location !== undefined) {
      updateData['location'] = dto.location ? this.sanitizeText(dto.location) : null;
    }
    if (dto.productName !== undefined) {
      updateData['productName'] = dto.productName ? this.sanitizeText(dto.productName) : null;
    }
    if (dto.avatarUrl !== undefined) updateData['avatarUrl'] = dto.avatarUrl;
    if (dto.displayOrder !== undefined) updateData['displayOrder'] = dto.displayOrder;
    if (dto.isActive !== undefined) updateData['isActive'] = dto.isActive;

    const updated = await (this.prisma as any).storefrontTestimonial.update({
      where: { id },
      data: updateData,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'TESTIMONIAL_UPDATED',
      entity: 'StorefrontTestimonial',
      entityId: id,
      oldValues: { customerName: existing.customerName, isActive: existing.isActive },
      newValues: { customerName: updated.customerName, isActive: updated.isActive },
    });

    return { data: updated };
  }

  async setActive(
    organizationId: string,
    id: string,
    isActive: boolean,
    userId: string,
  ) {
    const existing = await (this.prisma as any).storefrontTestimonial.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException(`Testimonial '${id}' not found`);
    }

    const updated = await (this.prisma as any).storefrontTestimonial.update({
      where: { id },
      data: { isActive, updatedBy: userId },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: isActive ? 'TESTIMONIAL_ACTIVATED' : 'TESTIMONIAL_DEACTIVATED',
      entity: 'StorefrontTestimonial',
      entityId: id,
      newValues: { isActive },
    });

    return { data: updated };
  }

  async reorder(
    organizationId: string,
    items: { id: string; displayOrder: number }[],
    userId: string,
  ) {
    await Promise.all(
      items.map(({ id, displayOrder }) =>
        (this.prisma as any).storefrontTestimonial.updateMany({
          where: { id, organizationId },
          data: { displayOrder, updatedBy: userId },
        }),
      ),
    );

    await this.audit.log({
      organizationId,
      userId,
      action: 'TESTIMONIALS_REORDERED',
      entity: 'StorefrontTestimonial',
      metadata: { count: items.length },
    });

    return { data: { updated: items.length } };
  }

  async remove(organizationId: string, id: string, userId: string) {
    const existing = await (this.prisma as any).storefrontTestimonial.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException(`Testimonial '${id}' not found`);
    }

    await (this.prisma as any).storefrontTestimonial.delete({ where: { id } });

    await this.audit.log({
      organizationId,
      userId,
      action: 'TESTIMONIAL_DELETED',
      entity: 'StorefrontTestimonial',
      entityId: id,
      oldValues: { customerName: existing.customerName },
    });

    return { data: { deleted: true } };
  }

  async listPublic(organizationId: string) {
    const data = await (this.prisma as any).storefrontTestimonial.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        customerName: true,
        quote: true,
        rating: true,
        location: true,
        productName: true,
        avatarUrl: true,
        displayOrder: true,
      },
      orderBy: { displayOrder: 'asc' },
    });
    return { data };
  }
}
