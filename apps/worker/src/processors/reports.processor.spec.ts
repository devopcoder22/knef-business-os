import { ReportsProcessor } from './reports.processor';
import { JOB_TYPES } from '@knef/constants';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';

function makeDataset() {
  return {
    title: 'Sales Summary',
    headers: ['Metric', 'Value'],
    rows: [{ Metric: 'Total Orders', Value: 5 }],
    generatedAt: new Date(),
  };
}

function makePrisma() {
  return {
    auditLog: { create: jest.fn(async () => ({})) },
  };
}

function makeReportData(dataset = makeDataset()) {
  return { generate: jest.fn(async () => dataset) };
}

function makeExporters() {
  return {
    export: jest.fn(async () => ({ filePath: '/app/uploads/reports/org-1/report.csv', sizeBytes: 1024 })),
  };
}

function makeConfig() {
  return { get: jest.fn((_k: string, def?: unknown) => def ?? '/app/uploads') };
}

function makeJob(data: unknown): Job {
  return { id: 'j-1', name: JOB_TYPES.GENERATE_REPORT, data } as Job;
}

function makeData(overrides: Partial<{
  organizationId: string;
  reportType: string;
  params: Record<string, unknown>;
  requestedBy: string;
}> = {}) {
  return {
    organizationId: 'org-1',
    reportType: 'sales.summary',
    params: { format: 'csv' },
    requestedBy: 'user-1',
    ...overrides,
  };
}

describe('ReportsProcessor', () => {
  function makeProcessor(dataset = makeDataset()) {
    const prisma = makePrisma();
    const reportData = makeReportData(dataset);
    const exporters = makeExporters();
    const config = makeConfig();
    const processor = new ReportsProcessor(
      prisma as never,
      reportData as never,
      exporters as never,
      config as never,
    );
    return { processor, prisma, reportData, exporters };
  }

  it('returns { filePath, sizeBytes } on success', async () => {
    const { processor } = makeProcessor();
    const job = makeJob(makeData());

    const result = await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(result).toEqual({ filePath: expect.any(String), sizeBytes: 1024 });
  });

  it('throws UnrecoverableError for unknown report type', async () => {
    const { processor } = makeProcessor();
    const job = makeJob(makeData({ reportType: 'unknown.type' }));

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job),
    ).rejects.toThrow(UnrecoverableError);
  });

  it('accepts all 8 known report types', async () => {
    const knownTypes = [
      'sales.summary', 'sales.orders',
      'inventory.valuation', 'inventory.low_stock',
      'finance.pl', 'finance.expenses',
      'staff.attendance', 'purchasing.summary',
    ];

    for (const reportType of knownTypes) {
      const { processor } = makeProcessor();
      const job = makeJob(makeData({ reportType }));

      await expect(
        (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job),
      ).resolves.not.toThrow();
    }
  });

  it('defaults format to csv when params.format is missing', async () => {
    const { processor, exporters } = makeProcessor();
    const job = makeJob(makeData({ params: {} }));

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(exporters.export).toHaveBeenCalledWith(
      expect.anything(),
      'csv',
      expect.any(String),
      'org-1',
    );
  });

  it('passes xlsx format through to exporters', async () => {
    const { processor, exporters } = makeProcessor();
    const job = makeJob(makeData({ params: { format: 'xlsx' } }));

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(exporters.export).toHaveBeenCalledWith(
      expect.anything(),
      'xlsx',
      expect.any(String),
      'org-1',
    );
  });

  it('falls back to csv for invalid format values', async () => {
    const { processor, exporters } = makeProcessor();
    const job = makeJob(makeData({ params: { format: 'docx' } }));

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(exporters.export).toHaveBeenCalledWith(
      expect.anything(),
      'csv',
      expect.any(String),
      'org-1',
    );
  });

  it('creates an AuditLog entry after successful export', async () => {
    const { processor, prisma } = makeProcessor();
    const job = makeJob(makeData({ requestedBy: 'user-42' }));

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditData = (prisma.auditLog.create as jest.Mock).mock.calls[0][0].data;
    expect(auditData.organizationId).toBe('org-1');
    expect(auditData.userId).toBe('user-42');
    expect(auditData.action).toBe('REPORT_GENERATED');
    expect(auditData.entity).toBe('Report');
  });

  it('AuditLog metadata includes rowCount and sizeBytes', async () => {
    const dataset = { ...makeDataset(), rows: [{ a: 1 }, { a: 2 }, { a: 3 }] } as unknown as ReturnType<typeof makeDataset>;
    const { processor, prisma } = makeProcessor(dataset);
    const job = makeJob(makeData());

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    const meta = (prisma.auditLog.create as jest.Mock).mock.calls[0][0].data.metadata;
    expect(meta.rowCount).toBe(3);
    expect(meta.sizeBytes).toBe(1024);
  });

  it('ignores unknown job types', async () => {
    const { processor, reportData } = makeProcessor();
    const job = { id: 'j-1', name: 'UNKNOWN', data: {} } as Job;

    const result = await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(result).toBeUndefined();
    expect(reportData.generate).not.toHaveBeenCalled();
  });

  it('passes organizationId to reportData.generate and exporters', async () => {
    const { processor, reportData, exporters } = makeProcessor();
    const job = makeJob(makeData({ organizationId: 'org-special' }));

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(reportData.generate).toHaveBeenCalledWith('org-special', 'sales.summary', expect.anything());
    expect(exporters.export).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      'org-special',
    );
  });
});
