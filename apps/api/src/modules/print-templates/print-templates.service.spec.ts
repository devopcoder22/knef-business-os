/**
 * PrintTemplatesService — security tests (Phase 24P)
 *
 * Covers:
 * 1. create() rejects content with <script> tags
 * 2. create() rejects content with javascript: protocol
 * 3. create() rejects content with event handler attributes (onclick=)
 * 4. create() rejects content with eval()
 * 5. create() accepts safe Handlebars-style template content
 * 6. create() sets isDefault=false on existing default when new is set as default
 * 7. getAvailableVariables() returns correct variable list for each template type
 */

import { BadRequestException } from '@nestjs/common';
import { PrintTemplatesService } from './print-templates.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    printTemplate: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: { data: unknown }) => ({ id: 'pt-1', ...(args.data as object) })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const service = new PrintTemplatesService(prisma as never);
  return { service, prisma };
}

describe('PrintTemplatesService — security (Phase 24P)', () => {
  const SAFE_CONTENT = '<div>{{org.name}} | Order: {{order.reference}}</div>';

  it('1: create() rejects content with <script> tags', async () => {
    const { service } = makeService();

    await expect(
      service.create('org-1', {
        name: 'Evil Receipt',
        templateType: 'RECEIPT',
        content: '<script>alert("xss")</script><div>{{org.name}}</div>',
      }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('2: create() rejects content with javascript: protocol', async () => {
    const { service } = makeService();

    await expect(
      service.create('org-1', {
        name: 'Bad Template',
        templateType: 'INVOICE',
        content: '<a href="javascript:alert(1)">Click</a>',
      }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('3: create() rejects content with event handler attributes', async () => {
    const { service } = makeService();

    await expect(
      service.create('org-1', {
        name: 'Event Template',
        templateType: 'RECEIPT',
        content: '<div onclick="alert(1)">{{org.name}}</div>',
      }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('4: create() rejects content with eval()', async () => {
    const { service } = makeService();

    await expect(
      service.create('org-1', {
        name: 'Eval Template',
        templateType: 'PO',
        content: 'eval("window.location.href=\\"http://evil.com\\"")',
      }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('5: create() accepts safe Handlebars-style template content', async () => {
    const { service, prisma } = makeService();

    await service.create('org-1', {
      name: 'Safe Receipt',
      templateType: 'RECEIPT',
      content: SAFE_CONTENT,
    }, 'user-1');

    expect((prisma.printTemplate as any).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Safe Receipt',
          templateType: 'RECEIPT',
          content: SAFE_CONTENT,
        }),
      }),
    );
  });

  it('6: create() clears existing defaults when new template is set as default', async () => {
    const { service, prisma } = makeService();

    await service.create('org-1', {
      name: 'New Default Receipt',
      templateType: 'RECEIPT',
      content: SAFE_CONTENT,
      isDefault: true,
    }, 'user-1');

    expect((prisma.printTemplate as any).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', templateType: 'RECEIPT', isDefault: true }),
        data: { isDefault: false },
      }),
    );
  });

  it('7: getAvailableVariables() returns correct variables for RECEIPT', () => {
    const { service } = makeService();

    const result = service.getAvailableVariables('RECEIPT');

    expect(result.templateType).toBe('RECEIPT');
    expect(result.variables).toContain('org.name');
    expect(result.variables).toContain('order.reference');
    expect(result.variables).toContain('payment.method');
  });

  it('7b: getAvailableVariables() returns correct variables for BARCODE_LABEL', () => {
    const { service } = makeService();

    const result = service.getAvailableVariables('BARCODE_LABEL');

    expect(result.variables).toContain('product.barcode');
    expect(result.variables).toContain('product.sku');
    expect(result.variables).not.toContain('order.reference');
  });
});
