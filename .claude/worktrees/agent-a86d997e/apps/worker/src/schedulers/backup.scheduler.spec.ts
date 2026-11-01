import { BackupScheduler } from './backup.scheduler';
import { JOB_TYPES } from '@knef/constants';

function makeConfig(backupHour?: number) {
  return {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'BACKUP_CRON_HOUR') return backupHour ?? def;
      return def;
    }),
  };
}

describe('BackupScheduler.enqueueBackup', () => {
  function makeScheduler() {
    const config = makeConfig();
    const scheduler = new BackupScheduler(config as never);
    const add = jest.fn(async () => ({ id: 'job-1' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;
    return { scheduler, add };
  }

  it('enqueues a RUN_BACKUP job with triggeredBy: scheduler', async () => {
    const { scheduler, add } = makeScheduler();

    await (scheduler as unknown as { enqueueBackup: () => Promise<void> }).enqueueBackup();

    expect(add).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [jobType, jobData] = (add.mock.calls as any)[0] as [string, { triggeredBy: string }];
    expect(jobType).toBe(JOB_TYPES.RUN_BACKUP);
    expect(jobData.triggeredBy).toBe('scheduler');
  });

  it('job uses a date-based jobId for deduplication', async () => {
    const { scheduler, add } = makeScheduler();

    await (scheduler as unknown as { enqueueBackup: () => Promise<void> }).enqueueBackup();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, , opts] = (add.mock.calls as any)[0] as [string, unknown, { jobId: string }];
    // jobId should be date-prefixed e.g. "backup:2026-10-03"
    expect(opts.jobId).toMatch(/^backup:\d{4}-\d{2}-\d{2}$/);
  });

  it('job options include retry config', async () => {
    const { scheduler, add } = makeScheduler();

    await (scheduler as unknown as { enqueueBackup: () => Promise<void> }).enqueueBackup();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, , opts] = (add.mock.calls as any)[0] as [string, unknown, { attempts: number; removeOnFail: number }];
    expect(opts.attempts).toBeGreaterThanOrEqual(1);
    expect(opts.removeOnFail).toBeGreaterThan(0);
  });
});

describe('BackupScheduler.check — once-per-day guard', () => {
  it('does not enqueue if the backup was already run today', async () => {
    const config = makeConfig(2);
    const scheduler = new BackupScheduler(config as never);
    const add = jest.fn(async () => ({ id: 'job-1' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    // Pre-set lastBackupDate to today so the guard fires
    const today = new Date().toISOString().slice(0, 10);
    (scheduler as unknown as { lastBackupDate: string | null }).lastBackupDate = today;

    await (scheduler as unknown as { check: () => Promise<void> }).check();

    // Guard should prevent enqueueing regardless of hour
    expect(add).not.toHaveBeenCalled();
  });

  it('does not enqueue when current hour does not match BACKUP_CRON_HOUR', async () => {
    // Use an hour that is guaranteed to never match current hour
    const impossibleHour = 99;
    const config = makeConfig(impossibleHour);
    const scheduler = new BackupScheduler(config as never);
    const add = jest.fn(async () => ({ id: 'job-1' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    await (scheduler as unknown as { check: () => Promise<void> }).check();

    expect(add).not.toHaveBeenCalled();
  });

  it('enqueues when hour matches and today has not been backed up', async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const config = makeConfig(currentHour);
    const scheduler = new BackupScheduler(config as never);
    const add = jest.fn(async () => ({ id: 'job-1' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    // Ensure lastBackupDate is not today (null means never backed up)
    (scheduler as unknown as { lastBackupDate: string | null }).lastBackupDate = null;

    await (scheduler as unknown as { check: () => Promise<void> }).check();

    expect(add).toHaveBeenCalledTimes(1);
  });

  it('sets lastBackupDate after enqueueing to prevent double-run', async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const config = makeConfig(currentHour);
    const scheduler = new BackupScheduler(config as never);
    const add = jest.fn(async () => ({ id: 'job-1' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;
    (scheduler as unknown as { lastBackupDate: string | null }).lastBackupDate = null;

    await (scheduler as unknown as { check: () => Promise<void> }).check();
    await (scheduler as unknown as { check: () => Promise<void> }).check();

    expect(add).toHaveBeenCalledTimes(1);
  });
});
