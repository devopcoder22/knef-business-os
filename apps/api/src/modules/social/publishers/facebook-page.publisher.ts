import { Injectable, Logger } from '@nestjs/common';
import { SocialAccount, MediaAsset } from '@prisma/client';
import axios from 'axios';
import {
  SocialPublisherInterface,
  PublishContent,
  PublishResult,
  MediaValidationResult,
  PUBLICATION_STATUS,
} from './publisher.interface';

const GRAPH_API = 'https://graph.facebook.com/v26.0';

@Injectable()
export class FacebookPagePublisher implements SocialPublisherInterface {
  readonly provider = 'FACEBOOK';
  private readonly logger = new Logger(FacebookPagePublisher.name);

  validateContent(
    _account: SocialAccount,
    content: PublishContent,
    assets: MediaAsset[],
  ): MediaValidationResult {
    const errors: string[] = [];
    if (!content.body && content.mediaUrls.length === 0) {
      errors.push('Facebook post must have body text or at least one media asset.');
    }
    for (const asset of assets) {
      if (asset.mimeType.startsWith('video/') && asset.size > 4_000_000_000) {
        errors.push(`Video ${asset.filename} exceeds 4 GB Facebook limit.`);
      }
      if (asset.mimeType.startsWith('image/') && asset.size > 10_485_760) {
        errors.push(`Image ${asset.filename} exceeds 10 MB Facebook limit.`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(
    token: string,
    account: SocialAccount,
    content: PublishContent,
    _idempotencyKey: string,
  ): Promise<PublishResult> {
    const pageId = account.providerAccountId;
    try {
      const params: Record<string, unknown> = { access_token: token };
      if (content.body) params.message = content.body;
      if (content.destinationUrl) params.link = content.destinationUrl;

      let endpoint = `${GRAPH_API}/${pageId}/feed`;

      if (content.contentType === 'VIDEO' || content.contentType === 'REEL') {
        endpoint =
          content.contentType === 'REEL'
            ? `${GRAPH_API}/${pageId}/video_reels`
            : `${GRAPH_API}/${pageId}/videos`;
        if (content.mediaUrls[0]) params.file_url = content.mediaUrls[0];
        params.description = content.body;
        delete params.message;
      } else if (content.contentType === 'IMAGE' && content.mediaUrls.length === 1) {
        endpoint = `${GRAPH_API}/${pageId}/photos`;
        params.url = content.mediaUrls[0];
        params.published = true;
      } else if (content.mediaUrls.length > 0) {
        params.link = content.mediaUrls[0];
      }

      const res = await axios.post<{ id: string }>(endpoint, params);
      return {
        status: PUBLICATION_STATUS.PUBLISHED,
        externalPostId: res.data.id,
        isRetryable: false,
      };
    } catch (err: unknown) {
      return this.mapAxiosError(err);
    }
  }

  async getPublicationStatus(
    token: string,
    _account: SocialAccount,
    externalPostId: string,
  ): Promise<PublishResult> {
    try {
      const res = await axios.get<{ id: string; is_published?: boolean }>(
        `${GRAPH_API}/${externalPostId}`,
        { params: { access_token: token, fields: 'id,is_published' } },
      );
      return {
        status:
          res.data.is_published !== false
            ? PUBLICATION_STATUS.PUBLISHED
            : PUBLICATION_STATUS.PROCESSING,
        externalPostId: res.data.id,
        isRetryable: false,
      };
    } catch (err: unknown) {
      return this.mapAxiosError(err);
    }
  }

  private mapAxiosError(err: unknown): PublishResult {
    const e = err as {
      response?: {
        data?: { error?: { code?: number; message?: string; type?: string } };
        status?: number;
      };
    };
    const fbErr = e.response?.data?.error;
    const httpStatus = e.response?.status ?? 0;
    this.logger.error('Facebook API error', fbErr ?? err);

    const isRetryable = httpStatus === 429 || httpStatus >= 500;
    return {
      status: PUBLICATION_STATUS.FAILED,
      isRetryable,
      errorCode: fbErr?.code?.toString() ?? String(httpStatus),
      errorMessage: fbErr?.message ?? 'Facebook API error',
      retryAfterMs: isRetryable ? 60_000 : undefined,
    };
  }
}
