import { Injectable, BadRequestException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma, ProductStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../common/services/prisma.service';

export interface ImportProductResult {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; sku: string; reason: string }>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function makeUniqueSlug(
  prisma: PrismaService,
  organizationId: string,
  name: string,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let i = 1;
  while (
    await prisma.product.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    })
  ) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

const HEADER_MAP: Record<string, string> = {
  brand: 'brandName',
  category: 'categoryName',
  'product name': 'name',
  sku: 'sku',
  barcode: 'barcode',
  gtin: 'gtin',
  status: 'status',
  'weight (kg)': 'weight',
  weight: 'weight',
  'short description': 'shortDesc',
  shortdesc: 'shortDesc',
  description: 'description',
  'cost price (ngn)': 'costPrice',
  'cost price': 'costPrice',
  'selling price (ngn)': 'sellingPrice',
  'selling price': 'sellingPrice',
  'compare price (ngn)': 'comparePrice',
  'compare price': 'comparePrice',
  'low stock alert threshold': 'lowStockAlert',
  'low stock alert': 'lowStockAlert',
  'imei / serials': 'serialsRaw',
  'imei/serials': 'serialsRaw',
  serials: 'serialsRaw',
};

function mapRow(raw: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalised = key.toLowerCase().trim();
    const field = HEADER_MAP[normalised];
    if (field) {
      result[field] = String(value ?? '').trim();
    }
  }
  return result;
}

function resolveStatus(raw: string): ProductStatus {
  const upper = raw.toUpperCase().trim();
  if (upper === 'INACTIVE') return ProductStatus.INACTIVE;
  if (upper === 'DRAFT') return ProductStatus.DRAFT;
  if (upper === 'DISCONTINUED') return ProductStatus.DISCONTINUED;
  return ProductStatus.ACTIVE;
}

@Injectable()
export class ProductsImportService {
  constructor(private readonly prisma: PrismaService) {}

  generateTemplate(): Buffer {
    const headers = [
      'Brand',
      'Category',
      'Product Name',
      'SKU',
      'Barcode',
      'GTIN',
      'Status',
      'Weight (kg)',
      'Short Description',
      'Description',
      'Cost Price (NGN)',
      'Selling Price (NGN)',
      'Compare Price (NGN)',
      'Low Stock Alert Threshold',
      'IMEI / Serials',
    ];

    const sample = [
      'Samsung',
      'Smartphones',
      'Samsung Galaxy S24',
      'SGS24-BLK-128',
      '1234567890123',
      '00012345678905',
      'ACTIVE',
      '0.18',
      'Flagship smartphone',
      'The Samsung Galaxy S24 features...',
      '350000',
      '420000',
      '449999',
      '5',
      '358240051111110',
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);

    ws['!cols'] = [
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
      { wch: 25 },
      { wch: 35 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 },
      { wch: 25 },
      { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async importFile(
    buffer: Buffer,
    _originalName: string,
    organizationId: string,
    _userId: string,
  ): Promise<ImportProductResult> {
    const wb = XLSX.read(buffer, {
      type: 'buffer',
      cellFormula: false,
      cellHTML: false,
    });

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: '',
    });

    if (rows.length > 2000) {
      throw new BadRequestException(
        'Import file exceeds the maximum of 2000 rows',
      );
    }

    const result: ImportProductResult = {
      total: rows.length,
      created: 0,
      skipped: 0,
      errors: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-indexed, row 1 is header
      const mapped = mapRow(rows[i]);

      // Skip completely empty rows
      if (Object.values(mapped).every((v) => v === '')) {
        result.total -= 1;
        continue;
      }

      const {
        brandName = '',
        categoryName = '',
        name = '',
        sku = '',
        barcode = '',
        gtin = '',
        status = '',
        weight = '',
        shortDesc = '',
        description = '',
        costPrice = '',
        sellingPrice = '',
        comparePrice = '',
        lowStockAlert: lowStockAlertRaw = '',
        serialsRaw = '',
      } = mapped;

      if (!name || !sku) {
        result.errors.push({
          row: rowNum,
          sku: sku || '—',
          reason: 'Missing required field: Product Name or SKU',
        });
        continue;
      }

      if (!costPrice || !sellingPrice) {
        result.errors.push({
          row: rowNum,
          sku,
          reason: 'Missing required field: Cost Price or Selling Price',
        });
        continue;
      }

      try {
        // Check for duplicate SKU
        const existingProduct = await this.prisma.product.findFirst({
          where: { organizationId, sku },
          select: { id: true },
        });
        if (existingProduct) {
          result.skipped += 1;
          continue;
        }

        // Resolve brand
        let brandId: string | undefined;
        if (brandName) {
          const existingBrand = await this.prisma.brand.findFirst({
            where: {
              organizationId,
              name: { equals: brandName, mode: 'insensitive' },
            },
            select: { id: true },
          });
          if (existingBrand) {
            brandId = existingBrand.id;
          } else {
            const newBrand = await this.prisma.brand.create({
              data: {
                id: createId(),
                organizationId,
                name: brandName,
                slug: await this.makeUniqueBrandSlug(organizationId, brandName),
              },
              select: { id: true },
            });
            brandId = newBrand.id;
          }
        }

        // Resolve category
        let categoryId: string | undefined;
        if (categoryName) {
          const existingCat = await this.prisma.category.findFirst({
            where: {
              organizationId,
              name: { equals: categoryName, mode: 'insensitive' },
            },
            select: { id: true },
          });
          if (existingCat) {
            categoryId = existingCat.id;
          } else {
            const newCat = await this.prisma.category.create({
              data: {
                id: createId(),
                organizationId,
                name: categoryName,
                slug: await this.makeUniqueCategorySlug(
                  organizationId,
                  categoryName,
                ),
              },
              select: { id: true },
            });
            categoryId = newCat.id;
          }
        }

        // Parse serials
        const serials = serialsRaw
          ? serialsRaw
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        const isSerialized = serials.length > 0;

        const lowStockAlert =
          lowStockAlertRaw !== '' ? parseInt(lowStockAlertRaw, 10) : 5;
        const statusEnum = resolveStatus(status);
        const slug = await makeUniqueSlug(this.prisma, organizationId, name);

        const product = await this.prisma.product.create({
          data: {
            id: createId(),
            organizationId,
            name,
            slug,
            sku,
            barcode: barcode || undefined,
            gtin: gtin || undefined,
            categoryId,
            brandId,
            description: description || undefined,
            shortDesc: shortDesc || undefined,
            costPrice: new Prisma.Decimal(costPrice),
            sellingPrice: new Prisma.Decimal(sellingPrice),
            comparePrice: comparePrice
              ? new Prisma.Decimal(comparePrice)
              : undefined,
            lowStockAlert: isNaN(lowStockAlert) ? 5 : lowStockAlert,
            weight: weight ? new Prisma.Decimal(weight) : undefined,
            weightUnit: 'kg',
            status: statusEnum,
            isSerialized,
            trackInventory: true,
          },
        });

        // Create inventory levels for all active locations
        await this.createInventoryLevelsForAllLocations(
          organizationId,
          product.id,
        );

        // Create serialized units if applicable
        if (serials.length > 0) {
          await this.prisma.serializedUnit.createMany({
            data: serials.map((imei1) => ({
              id: createId(),
              organizationId,
              productId: product.id,
              imei1,
              costPrice: new Prisma.Decimal(costPrice),
              status: 'IN_STOCK' as const,
            })),
          });
        }

        result.created += 1;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unexpected error';
        result.errors.push({ row: rowNum, sku, reason: message });
      }
    }

    return result;
  }

  private async createInventoryLevelsForAllLocations(
    organizationId: string,
    productId: string,
  ): Promise<void> {
    const locations = await this.prisma.location.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    });

    for (const location of locations) {
      const existing = await this.prisma.inventoryLevel.findFirst({
        where: { productId, variantId: null, locationId: location.id },
      });
      if (!existing) {
        await this.prisma.inventoryLevel
          .create({
            data: {
              id: createId(),
              productId,
              variantId: null,
              locationId: location.id,
              quantity: 0,
              reserved: 0,
              incoming: 0,
            },
          })
          .catch(() => {});
      }
    }
  }

  private async makeUniqueBrandSlug(
    organizationId: string,
    name: string,
  ): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let i = 1;
    while (
      await this.prisma.brand.findFirst({
        where: { organizationId, slug },
        select: { id: true },
      })
    ) {
      slug = `${base}-${i++}`;
    }
    return slug;
  }

  private async makeUniqueCategorySlug(
    organizationId: string,
    name: string,
  ): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let i = 1;
    while (
      await this.prisma.category.findFirst({
        where: { organizationId, slug },
        select: { id: true },
      })
    ) {
      slug = `${base}-${i++}`;
    }
    return slug;
  }
}
