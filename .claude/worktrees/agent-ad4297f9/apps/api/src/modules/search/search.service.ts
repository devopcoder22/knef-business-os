import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(
    organizationId: string,
    q: string,
    types?: string[],
  ) {
    if (!q || q.trim().length < 2) {
      return { products: [], serializedUnits: [] };
    }

    const results: Record<string, unknown> = {};

    // Products — use tsvector for full-text, fallback to ILIKE for SKU/barcode
    if (!types || types.includes('products')) {
      results['products'] = await this.prisma.$queryRaw`
        SELECT id, name, sku, barcode, status
        FROM products
        WHERE organization_id = ${organizationId}
          AND deleted_at IS NULL
          AND (
            search_vector @@ plainto_tsquery('english', ${q})
            OR sku ILIKE ${'%' + q + '%'}
            OR barcode = ${q}
            OR name ILIKE ${'%' + q + '%'}
          )
        LIMIT 10
      `;
    }

    // Serialized units — IMEI / serial lookup
    if (!types || types.includes('serialized')) {
      results['serializedUnits'] = await this.prisma.serializedUnit.findMany({
        where: {
          organizationId,
          OR: [
            { imei1: { contains: q } },
            { imei2: { contains: q } },
            { serialNumber: { contains: q } },
          ],
        },
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
        take: 10,
      });
    }

    return results;
  }
}
