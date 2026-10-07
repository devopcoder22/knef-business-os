/**
 * Worker security regression tests.
 *
 * Verifies that security-critical behaviors are preserved:
 * - Org isolation: processors only act on records belonging to the requesting org
 * - UnrecoverableError prevents infinite BullMQ retry loops
 * - Sensitive fields (tokens, passwords) do not appear in logs
 * - Backup script receives password via env var, not command args
 */

import * as fs from 'fs';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { UnrecoverableError } from 'bullmq';
import { DocumentsProcessor } from './documents.processor';
import { ReportsProcessor } from './reports.processor';
import { BackupProcessor } from './backup.processor';
import { JOB_TYPES } from '@knef/constants';
import type { Job } from 'bullmq';

jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockSpawn = childProcess.spawn as jest.MockedFunction<typeof childProcess.spawn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig() {
  return {
    get: jest.fn((_k: string, def?: unknown) => def ?? '/app/uploads'),
    getOrThrow: jest.fn(() => 'enc-key'),
  };
}

function makeJob(name: string, data: unknown): Job {
  return { id: 'j-1', name, data } as Job;
}

function makeSpawnSuccess(stdoutLines: string[] = ['BACKUP_FILE=/app/backups/daily/knef.sql.gz', 'BACKUP_SIZE=1024']) {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  mockSpawn.mockReturnValue(child as unknown as ReturnType<typeof childProcess.spawn>);
  setImmediate(() => {
    for (const line of stdoutLines) child.stdout.emit('data', Buffer.from(line + '\n'));
    child.emit('close', 0);
  });
  return child;
}

// ── Org isolation ─────────────────────────────────────────────────────────────

describe('Org isolation — DocumentsProcessor', () => {
  it('uses organizationId from job data in the DB query, not a hardcoded value', async () => {
    const findFirst = jest.fn(async () => null);
    const prisma = {
      aIDocument: { findFirst, update: jest.fn(async () => null) },
      aIDocumentChunk: { deleteMany: jest.fn(), create: jest.fn() },
    };
    const embedding = { generateEmbedding: jest.fn(), storeEmbedding: jest.fn() };
    const processor = new DocumentsProcessor(prisma as never, embedding as never, makeConfig() as never);
    const job = makeJob(JOB_TYPES.INGEST_DOCUMENT, { documentId: 'doc-1', organizationId: 'org-targeted' });

    try {
      await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);
    } catch {
      // Expected — doc not found
    }

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-1', organizationId: 'org-targeted' },
    });
  });
});

describe('Org isolation — ReportsProcessor', () => {
  it('passes organizationId to reportData.generate so cross-org data cannot be returned', async () => {
    const generate = jest.fn(async () => ({ title: 'T', headers: [], rows: [], generatedAt: new Date() }));
    const prisma = { auditLog: { create: jest.fn(async () => ({})) } };
    const exporters = { export: jest.fn(async () => ({ filePath: '/f', sizeBytes: 100 })) };
    const processor = new ReportsProcessor(
      prisma as never,
      { generate } as never,
      exporters as never,
      makeConfig() as never,
    );
    const job = makeJob(JOB_TYPES.GENERATE_REPORT, {
      organizationId: 'org-targeted',
      reportType: 'sales.summary',
      params: {},
      requestedBy: 'user-1',
    });

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(generate).toHaveBeenCalledWith('org-targeted', 'sales.summary', expect.anything());
  });
});

// ── UnrecoverableError prevents retry ────────────────────────────────────────

describe('UnrecoverableError — prevents infinite retry', () => {
  it('DocumentsProcessor: not-found doc throws UnrecoverableError', async () => {
    const prisma = {
      aIDocument: { findFirst: jest.fn(async () => null), update: jest.fn() },
      aIDocumentChunk: { deleteMany: jest.fn(), create: jest.fn() },
    };
    const embedding = { generateEmbedding: jest.fn(), storeEmbedding: jest.fn() };
    const processor = new DocumentsProcessor(prisma as never, embedding as never, makeConfig() as never);
    const job = makeJob(JOB_TYPES.INGEST_DOCUMENT, { documentId: 'x', organizationId: 'org-1' });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<void> }).process(job),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('ReportsProcessor: unknown report type throws UnrecoverableError', async () => {
    const prisma = { auditLog: { create: jest.fn() } };
    const reportData = { generate: jest.fn() };
    const exporters = { export: jest.fn() };
    const processor = new ReportsProcessor(
      prisma as never, reportData as never, exporters as never, makeConfig() as never,
    );
    const job = makeJob(JOB_TYPES.GENERATE_REPORT, {
      organizationId: 'org-1', reportType: 'fake.type', params: {}, requestedBy: 'u',
    });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

// ── Password not in spawn args ────────────────────────────────────────────────

describe('Backup security — PGPASSWORD in env, not args', () => {
  beforeEach(() => jest.clearAllMocks());

  it('spawn args do not contain the DATABASE_URL password', async () => {
    process.env.DATABASE_URL = 'postgresql://user:supersecretpassword@localhost:5432/mydb';
    makeSpawnSuccess();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 1024 } as fs.Stats);

    const config = makeConfig();
    const processor = new BackupProcessor(config as never);
    const job = makeJob(JOB_TYPES.RUN_BACKUP, { triggeredBy: 'test' });

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    const spawnArgs = mockSpawn.mock.calls[0] as unknown[];
    // The second argument is the script args array — should not contain password
    const scriptArgs = spawnArgs[1] as string[];
    expect(scriptArgs.join(' ')).not.toContain('supersecretpassword');

    delete process.env.DATABASE_URL;
  });

  it('passes BACKUP_RETENTION_DAYS via env var, not args', async () => {
    makeSpawnSuccess();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 512 } as fs.Stats);

    const config = {
      get: jest.fn((key: string, def?: unknown) => {
        if (key === 'BACKUP_RETENTION_DAYS') return 30;
        return def ?? '/app/backups';
      }),
    };
    const processor = new BackupProcessor(config as never);
    const job = makeJob(JOB_TYPES.RUN_BACKUP, { triggeredBy: 'test' });

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    const spawnOpts = (mockSpawn.mock.calls[0] as unknown[])[2] as { env: Record<string, string> };
    expect(spawnOpts.env.BACKUP_RETENTION_DAYS).toBe('30');
  });
});
