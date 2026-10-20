import { Test, TestingModule } from '@nestjs/testing';
import { InstagramPublisher } from './instagram.publisher';
import { PUBLICATION_STATUS } from './publisher.interface';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeAccount = (overrides = {}) => ({
  id: 'sa-2',
  organizationId: 'org-1',
  provider: 'INSTAGRAM',
  providerAccountId: 'ig-user-123',
  accountType: 'BUSINESS',
  displayName: 'KNEF IG',
  capabilities: [],
  approvalStatus: 'APP_REVIEW_PENDING',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeContent = (overrides = {}) => ({
  body: 'Check out our new product',
  mediaUrls: ['https://cdn.example.com/photo.jpg'],
  contentType: 'IMAGE' as const,
  ...overrides,
});

const makeAsset = (overrides = {}) => ({
  id: 'a1',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 500_000,
  url: 'https://cdn.example.com/photo.jpg',
  width: 1080,
  height: 1080,
  ...overrides,
});

describe('InstagramPublisher', () => {
  let publisher: InstagramPublisher;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [InstagramPublisher],
    }).compile();

    publisher = module.get<InstagramPublisher>(InstagramPublisher);
  });

  describe('validateContent', () => {
    it('passes for valid JPEG image post', () => {
      const result = publisher.validateContent(makeAccount() as any, makeContent(), [makeAsset() as any]);
      expect(result.valid).toBe(true);
    });

    it('rejects non-JPEG images', () => {
      const pngAsset = makeAsset({ mimeType: 'image/png', filename: 'photo.png' });
      const result = publisher.validateContent(makeAccount() as any, makeContent(), [pngAsset as any]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/JPEG/);
    });

    it('rejects carousel with more than 20 items', () => {
      const urls = Array.from({ length: 21 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
      const result = publisher.validateContent(
        makeAccount() as any,
        makeContent({ mediaUrls: urls, contentType: 'CAROUSEL' as const }),
        [],
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/20 items/);
    });

    it('rejects non-text post with no media', () => {
      const result = publisher.validateContent(
        makeAccount() as any,
        makeContent({ mediaUrls: [] }),
        [],
      );
      expect(result.valid).toBe(false);
    });
  });

  describe('publish', () => {
    it('creates container and publishes, returning PUBLISHED', async () => {
      // container creation
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container-1' } });
      // poll FINISHED
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });
      // publish
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'ig-post-1' } });

      const result = await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-1');

      expect(result.status).toBe(PUBLICATION_STATUS.PUBLISHED);
      expect(result.externalPostId).toBe('ig-post-1');
    });

    it('returns PROCESSING when container not ready within timeout', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container-2' } });
      // Poll always returns IN_PROGRESS
      mockedAxios.get.mockResolvedValue({ data: { status_code: 'IN_PROGRESS' } });

      const result = await publisher.publish('token', makeAccount() as any, makeContent(), 'idem-2');

      expect(result.status).toBe(PUBLICATION_STATUS.PROCESSING);
      expect(result.providerPublishId).toBe('container-2');
      expect(result.isRetryable).toBe(true);
    }, 40_000);

    it('handles CAROUSEL with multiple items', async () => {
      const urls = ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'];
      const carouselContent = makeContent({ mediaUrls: urls, contentType: 'CAROUSEL' as const });

      // children creation
      mockedAxios.post
        .mockResolvedValueOnce({ data: { id: 'child-1' } })
        .mockResolvedValueOnce({ data: { id: 'child-2' } })
        .mockResolvedValueOnce({ data: { id: 'carousel-1' } });
      // poll
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });
      // publish
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'ig-carousel-post' } });

      const result = await publisher.publish('token', makeAccount() as any, carouselContent, 'idem-3');

      // First two posts are for children, third is carousel container
      expect(mockedAxios.post).toHaveBeenCalledTimes(4); // 2 children + 1 carousel + 1 publish
      expect(result.status).toBe(PUBLICATION_STATUS.PUBLISHED);
    }, 15_000);
  });

  describe('getPublicationStatus', () => {
    it('returns PUBLISHED for FINISHED container', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'FINISHED', id: 'cont-1' } });

      const result = await publisher.getPublicationStatus('token', makeAccount() as any, 'cont-1');

      expect(result.status).toBe(PUBLICATION_STATUS.PUBLISHED);
    });

    it('returns PROCESSING for IN_PROGRESS', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'IN_PROGRESS', id: 'cont-2' } });

      const result = await publisher.getPublicationStatus('token', makeAccount() as any, 'cont-2');

      expect(result.status).toBe(PUBLICATION_STATUS.PROCESSING);
      expect(result.isRetryable).toBe(true);
    });

    it('returns FAILED for ERROR status', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'ERROR', id: 'cont-3' } });

      const result = await publisher.getPublicationStatus('token', makeAccount() as any, 'cont-3');

      expect(result.status).toBe(PUBLICATION_STATUS.FAILED);
    });

    it('PROCESSING is not PUBLISHED — invariant', () => {
      expect(PUBLICATION_STATUS.PROCESSING).not.toBe(PUBLICATION_STATUS.PUBLISHED);
    });
  });
});
