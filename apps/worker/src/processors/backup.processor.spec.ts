import * as fs from 'fs';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { BackupProcessor } from './backup.processor';
import { JOB_TYPES } from '@knef/constants';
import type { Job } from 'bullmq';

jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockSpawn = childProcess.spawn as jest.MockedFunction<typeof childProcess.spawn>;

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, def?: unknown) => {
      const values: Record<string, unknown> = {
        REDIS_URL: 'redis://localhost:6379',
        BACKUP_DIR: '/app/backups',
        BACKUP_RETENTION_DAYS: 7,
        ...overrides,
      };
      return values[key] ?? def;
    }),
  };
}

function makeJob(data: unknown): Job {
  return { id: 'j-1', name: JOB_TYPES.RUN_BACKUP, data } as Job;
}

function makeSpawnMock(
  exitCode: number,
  stdoutLines: string[] = ['BACKUP_FILE=/app/backups/daily/knef_2026-10-03.sql.gz', 'BACKUP_SIZE=4096'],
) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  mockSpawn.mockReturnValue(child as unknown as ReturnType<typeof childProcess.spawn>);

  // Emit stdout lines and then close
  setImmediate(() => {
    for (const line of stdoutLines) {
      child.stdout.emit('data', Buffer.from(line + '\n'));
    }
    child.emit('close', exitCode);
  });

  return child;
}

describe('BackupProcessor.runBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns { filePath, sizeBytes } on success', async () => {
    makeSpawnMock(0);
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 4096 } as fs.Stats);

    const config = makeConfig();
    const processor = new BackupProcessor(config as never);
    const job = makeJob({ triggeredBy: 'scheduler' });

    const result = await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(result).toEqual({
      filePath: '/app/backups/daily/knef_2026-10-03.sql.gz',
      sizeBytes: 4096,
    });
  });

  it('throws when backup script exits with non-zero code', async () => {
    makeSpawnMock(1, []);
    const config = makeConfig();
    const processor = new BackupProcessor(config as never);
    const job = makeJob({ triggeredBy: 'scheduler' });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job),
    ).rejects.toThrow('Backup script exited with code 1');
  });

  it('throws when script does not output BACKUP_FILE line', async () => {
    makeSpawnMock(0, ['BACKUP_SIZE=4096']); // missing BACKUP_FILE=
    const config = makeConfig();
    const processor = new BackupProcessor(config as never);
    const job = makeJob({ triggeredBy: 'scheduler' });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job),
    ).rejects.toThrow('did not report BACKUP_FILE');
  });

  it('throws when backup file does not exist after script exit', async () => {
    makeSpawnMock(0);
    mockFs.existsSync.mockReturnValue(false);

    const config = makeConfig();
    const processor = new BackupProcessor(config as never);
    const job = makeJob({ triggeredBy: 'scheduler' });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job),
    ).rejects.toThrow('Backup file not found');
  });

  it('throws when backup file is empty (0 bytes)', async () => {
    makeSpawnMock(0);
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 0 } as fs.Stats);

    const config = makeConfig();
    const processor = new BackupProcessor(config as never);
    const job = makeJob({ triggeredBy: 'scheduler' });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job),
    ).rejects.toThrow('empty');
  });

  it('passes BACKUP_DIR and BACKUP_RETENTION_DAYS env vars to script', async () => {
    makeSpawnMock(0);
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 1024 } as fs.Stats);

    const config = makeConfig({ BACKUP_DIR: '/mnt/backups', BACKUP_RETENTION_DAYS: 14 });
    const processor = new BackupProcessor(config as never);
    const job = makeJob({ triggeredBy: 'manual' });

    await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    const spawnEnv = (mockSpawn.mock.calls[0] as unknown[])[2] as { env: Record<string, string> };
    expect(spawnEnv.env.BACKUP_DIR).toBe('/mnt/backups');
    expect(spawnEnv.env.BACKUP_RETENTION_DAYS).toBe('14');
  });

  it('ignores unknown job types', async () => {
    const config = makeConfig();
    const processor = new BackupProcessor(config as never);
    const job = { id: 'j-1', name: 'UNKNOWN', data: {} } as Job;

    const result = await (processor as unknown as { process: (j: Job) => Promise<unknown> }).process(job);

    expect(result).toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
