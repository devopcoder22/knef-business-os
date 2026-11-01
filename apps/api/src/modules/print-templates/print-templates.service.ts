import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';

export type PrintTemplateType = 'RECEIPT' | 'INVOICE' | 'PO' | 'GRN' | 'QUOTATION' | 'BARCODE_LABEL';

// Allowed variable tokens per template type (no script execution, no event handlers)
const ALLOWED_VARIABLES: Record<string, string[]> = {
  RECEIPT: [
    'org.name', 'org.address', 'org.phone', 'org.email', 'org.logoUrl',
    'order.reference', 'order.date', 'order.total', 'order.tax', 'order.discount',
    'order.items', 'payment.method', 'payment.amount', 'cashier.name',
    'customer.name', 'customer.phone',
  ],
  INVOICE: [
    'org.name', 'org.address', 'org.phone', 'org.email', 'org.logoUrl', 'org.taxId',
    'invoice.number', 'invoice.date', 'invoice.dueDate', 'invoice.total', 'invoice.tax',
    'invoice.items', 'customer.name', 'customer.address', 'customer.email',
  ],
  PO: [
    'org.name', 'org.address', 'org.phone', 'org.email', 'org.logoUrl',
    'po.reference', 'po.date', 'po.deliveryDate', 'po.total', 'po.items',
    'supplier.name', 'supplier.address', 'supplier.email', 'supplier.phone',
    'approver.name', 'approver.date',
  ],
  GRN: [
    'org.name', 'org.address', 'org.phone', 'org.logoUrl',
    'grn.reference', 'grn.date', 'grn.items', 'grn.total',
    'po.reference', 'supplier.name', 'receiver.name',
  ],
  QUOTATION: [
    'org.name', 'org.address', 'org.phone', 'org.email', 'org.logoUrl', 'org.taxId',
    'quote.reference', 'quote.date', 'quote.expiryDate', 'quote.total', 'quote.tax', 'quote.items',
    'customer.name', 'customer.address', 'customer.email',
    'rep.name', 'rep.phone',
  ],
  BARCODE_LABEL: [
    'product.name', 'product.sku', 'product.barcode', 'product.price',
    'org.name', 'variant.options',
  ],
};

// Forbidden content patterns (XSS / script injection prevention)
const FORBIDDEN_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /eval\(/i,
  /document\./i,
  /window\./i,
  /import\s+/i,
  /require\s*\(/i,
];

export interface CreatePrintTemplateDto {
  name: string;
  templateType: PrintTemplateType;
  content: string;
  isDefault?: boolean;
  paperSize?: string;
  orientation?: string;
}

@Injectable()
export class PrintTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, templateType?: string) {
    const where: Record<string, unknown> = { organizationId, isActive: true };
    if (templateType) where['templateType'] = templateType;

    return (this.prisma as any).printTemplate.findMany({
      where,
      orderBy: [{ templateType: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(organizationId: string, id: string) {
    const template = await (this.prisma as any).printTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!template) throw new NotFoundException('Print template not found');
    return template;
  }

  async getDefault(organizationId: string, templateType: PrintTemplateType) {
    const template = await (this.prisma as any).printTemplate.findFirst({
      where: { organizationId, templateType, isDefault: true, isActive: true },
    });
    return template ?? null;
  }

  async create(organizationId: string, dto: CreatePrintTemplateDto, userId: string) {
    this.validateContent(dto.content, dto.templateType);

    if (dto.isDefault) {
      await this.clearDefaults(organizationId, dto.templateType);
    }

    return (this.prisma as any).printTemplate.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        templateType: dto.templateType,
        content: dto.content,
        isDefault: dto.isDefault ?? false,
        paperSize: dto.paperSize ?? 'A4',
        orientation: dto.orientation ?? 'portrait',
        variables: (ALLOWED_VARIABLES[dto.templateType] ?? []) as any,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: Partial<CreatePrintTemplateDto>,
    userId: string,
  ) {
    const template = await (this.prisma as any).printTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!template) throw new NotFoundException('Print template not found');

    if (dto.content) {
      this.validateContent(dto.content, template.templateType);
    }

    if (dto.isDefault) {
      await this.clearDefaults(organizationId, template.templateType, id);
    }

    return (this.prisma as any).printTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        content: dto.content,
        isDefault: dto.isDefault,
        paperSize: dto.paperSize,
        orientation: dto.orientation,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const template = await (this.prisma as any).printTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!template) throw new NotFoundException('Print template not found');

    await (this.prisma as any).printTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Template deactivated' };
  }

  getAvailableVariables(templateType: PrintTemplateType) {
    return { templateType, variables: ALLOWED_VARIABLES[templateType] ?? [] };
  }

  private validateContent(content: string, templateType: string) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        throw new BadRequestException(
          'Template content contains forbidden patterns (script injection not allowed)',
        );
      }
    }
    if (content.length > 50000) {
      throw new BadRequestException('Template content exceeds maximum length of 50,000 characters');
    }
  }

  private async clearDefaults(
    organizationId: string,
    templateType: string,
    excludeId?: string,
  ) {
    const where: Record<string, unknown> = { organizationId, templateType, isDefault: true };
    if (excludeId) where['NOT'] = { id: excludeId };
    await (this.prisma as any).printTemplate.updateMany({
      where,
      data: { isDefault: false },
    });
  }
}
