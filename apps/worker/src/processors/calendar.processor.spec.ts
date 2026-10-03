import { CalendarProcessor } from './calendar.processor';
import { JOB_TYPES } from '@knef/constants';
import type { Job } from 'bullmq';

function makeCalendarSync() {
  return { syncIntegration: jest.fn(async () => undefined) };
}

function makeConfig() {
  return { get: jest.fn((_k: string, def?: unknown) => def ?? 'redis://localhost:6379') };
}

function makeJob(name: string, data: unknown): Job {
  return { id: 'job-1', name, data } as Job;
}

describe('CalendarProcessor.process', () => {
  function makeProcessor() {
    const calendarSync = makeCalendarSync();
    const config = makeConfig();
    const processor = new CalendarProcessor(calendarSync as never, config as never);
    return { processor, calendarSync };
  }

  it('routes SYNC_CALENDAR job to CalendarSyncService.syncIntegration', async () => {
    const { processor, calendarSync } = makeProcessor();
    const data = { connectionId: 'int-1', organizationId: 'org-1', userId: 'u-1', provider: 'google' };
    const job = makeJob(JOB_TYPES.SYNC_CALENDAR, data);

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    expect(calendarSync.syncIntegration).toHaveBeenCalledWith('int-1', 'org-1');
  });

  it('ignores unknown job types without throwing', async () => {
    const { processor, calendarSync } = makeProcessor();
    const job = makeJob('UNKNOWN_JOB', {});

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<void> }).process(job),
    ).resolves.not.toThrow();

    expect(calendarSync.syncIntegration).not.toHaveBeenCalled();
  });

  it('propagates errors from CalendarSyncService', async () => {
    const { processor, calendarSync } = makeProcessor();
    calendarSync.syncIntegration.mockRejectedValue(new Error('API down'));
    const data = { connectionId: 'int-1', organizationId: 'org-1', userId: 'u-1', provider: 'google' };
    const job = makeJob(JOB_TYPES.SYNC_CALENDAR, data);

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<void> }).process(job),
    ).rejects.toThrow('API down');
  });

  it('passes connectionId (not integrationId) to syncIntegration', async () => {
    const { processor, calendarSync } = makeProcessor();
    const data = { connectionId: 'conn-abc', organizationId: 'org-xyz', userId: 'u-1', provider: 'microsoft' };
    const job = makeJob(JOB_TYPES.SYNC_CALENDAR, data);

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    expect(calendarSync.syncIntegration).toHaveBeenCalledWith('conn-abc', 'org-xyz');
  });
});
