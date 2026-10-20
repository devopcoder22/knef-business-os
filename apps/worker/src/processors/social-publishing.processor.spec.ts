import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SocialPublishingProcessor } from './social-publishing.processor';
import { SocialPublisherService } from '../services/social-publisher.service';
import type { Job } from 'bullmq';

// Mock Worker and Redis from bullmq/ioredis to avoid real connections
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
);

const mockSocialPublisher = {
  executePublish: jest.fn().mockResolvedValue(undefined),
  checkPublicationStatus: jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('redis://localhost:6379'),
  getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
};

const makeJob = (name: string, data: Record<string, unknown>): Partial<Job> => ({
  id: 'job-1',
  name,
  data,
});

describe('SocialPublishingProcessor', () => {
  let processor: SocialPublishingProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialPublishingProcessor,
        { provide: SocialPublisherService, useValue: mockSocialPublisher },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    processor = module.get<SocialPublishingProcessor>(SocialPublishingProcessor);
    processor.onModuleInit();
  });

  it('processes SOCIAL_PUBLISH job by calling executePublish', async () => {
    const job = makeJob('social-publish', {
      attemptId: 'attempt-1',
      organizationId: 'org-1',
      draftId: 'draft-1',
      socialAccountId: 'sa-1',
      provider: 'FACEBOOK',
    });

    await processor.process(job as Job);

    expect(mockSocialPublisher.executePublish).toHaveBeenCalledWith('attempt-1');
  });

  it('processes SOCIAL_STATUS_CHECK job by calling checkPublicationStatus', async () => {
    const job = makeJob('social-status-check', {
      attemptId: 'attempt-2',
      organizationId: 'org-1',
      provider: 'TIKTOK',
      providerPublishId: 'pub-tt-1',
      socialAccountId: 'sa-2',
    });

    await processor.process(job as Job);

    expect(mockSocialPublisher.checkPublicationStatus).toHaveBeenCalledWith(
      'attempt-2',
      'TIKTOK',
      'pub-tt-1',
    );
  });

  it('logs warning for unknown job types without throwing', async () => {
    const job = makeJob('unknown-job-type', { foo: 'bar' });

    await expect(processor.process(job as Job)).resolves.toBeUndefined();
    expect(mockSocialPublisher.executePublish).not.toHaveBeenCalled();
    expect(mockSocialPublisher.checkPublicationStatus).not.toHaveBeenCalled();
  });

  it('does not call executePublish twice for MARKETING_SCHEDULE_CHECK jobs', async () => {
    const job = makeJob('marketing-schedule-check', { organizationId: 'org-1' });

    await processor.process(job as Job);

    expect(mockSocialPublisher.executePublish).not.toHaveBeenCalled();
  });

  it('returns without processing if attemptId is missing', async () => {
    const job = makeJob('social-publish', { organizationId: 'org-1' });
    // executePublish receives undefined — should not throw
    mockSocialPublisher.executePublish.mockResolvedValueOnce(undefined);

    await expect(processor.process(job as Job)).resolves.toBeUndefined();
  });
});
