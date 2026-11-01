import { Test, TestingModule } from '@nestjs/testing';
import { TikTokPublisher } from './tiktok.publisher';
import { PUBLICATION_STATUS } from './publisher.interface';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeAccount = (overrides = {}) => ({
  id: 'sa-3',
  organizationId: 'org-1',
  provider: 'TIKTOK',
  providerAccountId: 'tt-user-1',
  accountType: 'CREATOR',
  displayName: 'KNEF TikTok',
  capabilities: [],
  approvalStatus: 'AUDIT_PENDING',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeContent = (overrides = {}) => ({
  body: 'New video on KNEF Gadgets!',
  mediaUrls: ['https://cdn.example.com/video.mp4'],
  contentType: 'VIDEO' as const,
  ...overrides,
});

const makeAsset = (overrides = {}) => ({
  id: 'v1',
  filename: 'video.mp4',
  mimeType: 'video/mp4',
  size: 20_000_000,
  url: 'https://cdn.example.com/video.mp4',
  ...overrides,
});

const mockCreatorInfo = {
  data: {
    privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
    comment_disabled: false,
    duet_disabled: false,
    stitch_disabled: false,
    max_video_post_duration_sec: 600,
  },
  error: { code: 'ok' },
};

const mockCreatorInfoPrivateOnly = {
  data: {
    privacy_level_options: ['SELF_ONLY'],
    comment_disabled: false,
    duet_disabled: false,
    stitch_disabled: false,
    max_video_post_duration_sec: 60,
  },
  error: { code: 'ok' },
};

describe('TikTokPublisher', () => {
  let publisher: TikTokPublisher;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TikTokPublisher],
    }).compile();

    publisher = module.get<TikTokPublisher>(TikTokPublisher);
  });

  describe('validateContent', () => {
    it('rejects TEXT-only content', () => {
      const result = publisher.validateContent(makeAccount() as any, makeContent({ contentType: 'TEXT' as const }), []);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/text-only/);
    });

    it('rejects empty mediaUrls', () => {
      const result = publisher.validateContent(makeAccount() as any, makeContent({ mediaUrls: [] }), []);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('at least one media URL'))).toBe(true);
    });

    it('rejects video > 4GB', () => {
      const bigVideo = makeAsset({ size: 4_100_000_000 });
      const result = publisher.validateContent(makeAccount() as any, makeContent(), [bigVideo as any]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/4 GB/);
    });

    it('rejects zero-size asset', () => {
      const emptyAsset = makeAsset({ size: 0 });
      const result = publisher.validateContent(makeAccount() as any, makeContent(), [emptyAsset as any]);
      expect(result.valid).toBe(false);
    });

    it('passes for valid video with URL', () => {
      const asset = makeAsset();
      const result = publisher.validateContent(makeAccount() as any, makeContent(), [asset as any]);
      expect(result.valid).toBe(true);
    });
  });

  describe('publish', () => {
    it('calls creator_info endpoint first', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: mockCreatorInfo }) // creator_info
        .mockResolvedValueOnce({ data: { data: { publish_id: 'pub-1' }, error: { code: 'ok' } } }); // init

      await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-1');

      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/creator_info/query/'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('uses SELF_ONLY when PUBLIC_TO_EVERYONE not in privacy_level_options', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: mockCreatorInfoPrivateOnly })
        .mockResolvedValueOnce({ data: { data: { publish_id: 'pub-2' }, error: { code: 'ok' } } });

      await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-2');

      const initCall = mockedAxios.post.mock.calls[1];
      expect(initCall[1]).toMatchObject({
        post_info: expect.objectContaining({ privacy_level: 'SELF_ONLY' }),
      });
    });

    it('uses PUBLIC_TO_EVERYONE when available', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: mockCreatorInfo })
        .mockResolvedValueOnce({ data: { data: { publish_id: 'pub-3' }, error: { code: 'ok' } } });

      await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-3');

      const initCall = mockedAxios.post.mock.calls[1];
      expect(initCall[1]).toMatchObject({
        post_info: expect.objectContaining({ privacy_level: 'PUBLIC_TO_EVERYONE' }),
      });
    });

    it('returns PROCESSING with publish_id', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: mockCreatorInfo })
        .mockResolvedValueOnce({ data: { data: { publish_id: 'pub-tt-4' }, error: { code: 'ok' } } });

      const result = await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-4');

      expect(result.status).toBe(PUBLICATION_STATUS.PROCESSING);
      expect(result.providerPublishId).toBe('pub-tt-4');
    });

    it('returns FAILED when TikTok API returns error code', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: mockCreatorInfo })
        .mockResolvedValueOnce({ data: { data: {}, error: { code: 'spam_risk_too_many_posts', message: 'Spam risk' } } });

      const result = await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-5');

      expect(result.status).toBe(PUBLICATION_STATUS.FAILED);
      expect(result.errorCode).toBe('spam_risk_too_many_posts');
    });
  });

  describe('getPublicationStatus', () => {
    it('returns PUBLISHED for PUBLISH_COMPLETE', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['tt-post-1'] },
          error: { code: 'ok' },
        },
      });

      const result = await publisher.getPublicationStatus('token', makeAccount() as any, 'pub-1');

      expect(result.status).toBe(PUBLICATION_STATUS.PUBLISHED);
      expect(result.externalPostId).toBe('tt-post-1');
    });

    it('returns FAILED for FAILED status', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          data: { status: 'FAILED', fail_reason: 'Content violation' },
          error: { code: 'ok' },
        },
      });

      const result = await publisher.getPublicationStatus('token', makeAccount() as any, 'pub-2');

      expect(result.status).toBe(PUBLICATION_STATUS.FAILED);
    });

    it('returns PROCESSING for IN_PROGRESS', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          data: { status: 'IN_PROGRESS' },
          error: { code: 'ok' },
        },
      });

      const result = await publisher.getPublicationStatus('token', makeAccount() as any, 'pub-3');

      expect(result.status).toBe(PUBLICATION_STATUS.PROCESSING);
      expect(result.isRetryable).toBe(true);
    });

    it('returns PROCESSING for PROCESSING_DOWNLOAD', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          data: { status: 'PROCESSING_DOWNLOAD' },
          error: { code: 'ok' },
        },
      });

      const result = await publisher.getPublicationStatus('token', makeAccount() as any, 'pub-4');

      expect(result.status).toBe(PUBLICATION_STATUS.PROCESSING);
    });

    it('PROCESSING is distinct from PUBLISHED', () => {
      expect(PUBLICATION_STATUS.PROCESSING).not.toBe(PUBLICATION_STATUS.PUBLISHED);
    });

    it('unaudited apps note: SELF_ONLY is the privacy level when public not available', async () => {
      // Verify that when only SELF_ONLY is returned by creator_info, publish uses it
      // (content visible only to creator in unaudited/sandbox state)
      mockedAxios.post
        .mockResolvedValueOnce({ data: mockCreatorInfoPrivateOnly })
        .mockResolvedValueOnce({ data: { data: { publish_id: 'pub-sandbox' }, error: { code: 'ok' } } });

      await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-sandbox');

      const initCall = mockedAxios.post.mock.calls[1];
      const postInfo = (initCall[1] as Record<string, Record<string, string>>).post_info;
      expect(postInfo.privacy_level).toBe('SELF_ONLY');
    });
  });
});
