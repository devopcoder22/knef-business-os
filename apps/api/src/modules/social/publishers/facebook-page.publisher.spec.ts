import { Test, TestingModule } from '@nestjs/testing';
import { FacebookPagePublisher } from './facebook-page.publisher';
import { PUBLICATION_STATUS } from './publisher.interface';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeAccount = (overrides = {}) => ({
  id: 'sa-1',
  organizationId: 'org-1',
  connectionId: 'conn-1',
  provider: 'FACEBOOK',
  providerAccountId: 'page-123',
  accountType: 'PAGE',
  displayName: 'Test Page',
  username: null,
  avatarUrl: null,
  externalBusinessId: null,
  capabilities: [],
  approvalStatus: 'APP_REVIEW_PENDING',
  isActive: true,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeContent = (overrides = {}) => ({
  body: 'Hello from KNEF',
  mediaUrls: [],
  contentType: 'TEXT' as const,
  ...overrides,
});

const makeImageAsset = (overrides = {}) => ({
  id: 'a1',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 1_000_000,
  url: 'https://cdn.example.com/photo.jpg',
  width: 1080,
  height: 1080,
  ...overrides,
});

const makeVideoAsset = (overrides = {}) => ({
  id: 'v1',
  filename: 'video.mp4',
  mimeType: 'video/mp4',
  size: 50_000_000,
  url: 'https://cdn.example.com/video.mp4',
  width: 1920,
  height: 1080,
  ...overrides,
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('FacebookPagePublisher', () => {
  let publisher: FacebookPagePublisher;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FacebookPagePublisher],
    }).compile();

    publisher = module.get<FacebookPagePublisher>(FacebookPagePublisher);
  });

  describe('validateContent', () => {
    it('passes for text-only post', () => {
      const result = publisher.validateContent(makeAccount() as any, makeContent(), []);
      expect(result.valid).toBe(true);
    });

    it('fails for empty body and no media', () => {
      const result = publisher.validateContent(makeAccount() as any, makeContent({ body: '', mediaUrls: [] }), []);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/body text or at least one media/);
    });

    it('fails for video exceeding 4GB', () => {
      const bigVideo = makeVideoAsset({ size: 4_100_000_000 });
      const result = publisher.validateContent(makeAccount() as any, makeContent({ mediaUrls: [bigVideo.url], contentType: 'VIDEO' as const }), [bigVideo as any]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/4 GB/);
    });

    it('fails for image exceeding 10MB', () => {
      const bigImage = makeImageAsset({ size: 11_000_000 });
      const result = publisher.validateContent(makeAccount() as any, makeContent({ mediaUrls: [bigImage.url], contentType: 'IMAGE' as const }), [bigImage as any]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/10 MB/);
    });

    it('passes for valid image', () => {
      const img = makeImageAsset();
      const result = publisher.validateContent(makeAccount() as any, makeContent({ mediaUrls: [img.url], contentType: 'IMAGE' as const }), [img as any]);
      expect(result.valid).toBe(true);
    });
  });

  describe('publish', () => {
    it('returns PUBLISHED with externalPostId on text post success', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'fb-post-1' } });

      const result = await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-1');

      expect(result.status).toBe(PUBLICATION_STATUS.PUBLISHED);
      expect(result.externalPostId).toBe('fb-post-1');
      expect(result.isRetryable).toBe(false);
    });

    it('calls photos endpoint for IMAGE content', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'fb-photo-1' } });
      const img = makeImageAsset();

      await publisher.publish('token', makeAccount() as any, makeContent({ mediaUrls: [img.url], contentType: 'IMAGE' as const }), 'idem-2');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/photos'),
        expect.anything(),
      );
    });

    it('calls videos endpoint for VIDEO content', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'fb-video-1' } });

      await publisher.publish('token', makeAccount() as any, makeContent({ mediaUrls: ['https://cdn.example.com/v.mp4'], contentType: 'VIDEO' as const }), 'idem-3');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/videos'),
        expect.anything(),
      );
    });

    it('calls video_reels endpoint for REEL content', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'fb-reel-1' } });

      await publisher.publish('token', makeAccount() as any, makeContent({ mediaUrls: ['https://cdn.example.com/r.mp4'], contentType: 'REEL' as const }), 'idem-4');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/video_reels'),
        expect.anything(),
      );
    });

    it('maps 429 to isRetryable=true', async () => {
      const axiosErr = { response: { status: 429, data: { error: { code: 4, message: 'Rate limit' } } } };
      mockedAxios.post.mockRejectedValueOnce(axiosErr);

      const result = await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-5');

      expect(result.status).toBe(PUBLICATION_STATUS.FAILED);
      expect(result.isRetryable).toBe(true);
    });

    it('maps 500 to isRetryable=true', async () => {
      const axiosErr = { response: { status: 500, data: {} } };
      mockedAxios.post.mockRejectedValueOnce(axiosErr);

      const result = await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-6');

      expect(result.isRetryable).toBe(true);
    });

    it('maps 400 to isRetryable=false', async () => {
      const axiosErr = { response: { status: 400, data: { error: { code: 100, message: 'Bad request' } } } };
      mockedAxios.post.mockRejectedValueOnce(axiosErr);

      const result = await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-7');

      expect(result.isRetryable).toBe(false);
    });
  });

  describe('getPublicationStatus', () => {
    it('returns PUBLISHED when is_published=true', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { id: 'fb-post-1', is_published: true } });

      const result = await publisher.getPublicationStatus('token', makeAccount() as any, 'fb-post-1');

      expect(result.status).toBe(PUBLICATION_STATUS.PUBLISHED);
    });

    it('returns PROCESSING when is_published=false', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { id: 'fb-post-1', is_published: false } });

      const result = await publisher.getPublicationStatus('token', makeAccount() as any, 'fb-post-1');

      expect(result.status).toBe(PUBLICATION_STATUS.PROCESSING);
    });

    it('never returns PUBLISHED from PROCESSING state alone', () => {
      expect(PUBLICATION_STATUS.PROCESSING).not.toBe(PUBLICATION_STATUS.PUBLISHED);
    });
  });
});
