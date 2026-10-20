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
const CONTAINER_POLL_TIMEOUT_MS = 30_000;
const CONTAINER_POLL_INTERVAL_MS = 3_000;

@Injectable()
export class InstagramPublisher implements SocialPublisherInterface {
  readonly provider = 'INSTAGRAM';
  private readonly logger = new Logger(InstagramPublisher.name);

  validateContent(
    _account: SocialAccount,
    content: PublishContent,
    assets: MediaAsset[],
  ): MediaValidationResult {
    const errors: string[] = [];
    if (content.mediaUrls.length === 0 && content.contentType !== 'TEXT') {
      errors.push('Instagram requires at least one media asset for non-text posts.');
    }
    if (content.contentType === 'CAROUSEL' && content.mediaUrls.length > 20) {
      errors.push('Instagram carousel supports up to 20 items.');
    }
    for (const asset of assets) {
      if (asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/jpg') continue;
      if (asset.mimeType.startsWith('image/') && asset.mimeType !== 'image/jpeg') {
        errors.push(
          `Instagram only accepts JPEG images; ${asset.filename} is ${asset.mimeType}.`,
        );
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
    const igUserId = account.providerAccountId;
    try {
      let containerId: string;

      if (content.contentType === 'CAROUSEL' && content.mediaUrls.length > 1) {
        // Create children first
        const childIds: string[] = [];
        for (const url of content.mediaUrls) {
          const isVideo = url.match(/\.(mp4|mov|avi)(\?|$)/i);
          const childRes = await axios.post<{ id: string }>(
            `${GRAPH_API}/${igUserId}/media`,
            {
              access_token: token,
              is_carousel_item: true,
              ...(isVideo
                ? { video_url: url, media_type: 'VIDEO' }
                : { image_url: url }),
            },
          );
          childIds.push(childRes.data.id);
        }
        const carouselRes = await axios.post<{ id: string }>(
          `${GRAPH_API}/${igUserId}/media`,
          {
            access_token: token,
            media_type: 'CAROUSEL',
            caption: content.body,
            children: childIds.join(','),
          },
        );
        containerId = carouselRes.data.id;
      } else {
        const mediaParams: Record<string, unknown> = {
          access_token: token,
          caption: content.body,
        };
        if (content.contentType === 'VIDEO') {
          mediaParams.media_type = 'VIDEO';
          mediaParams.video_url = content.mediaUrls[0];
        } else if (content.contentType === 'REEL') {
          mediaParams.media_type = 'REELS';
          mediaParams.video_url = content.mediaUrls[0];
        } else {
          mediaParams.image_url = content.mediaUrls[0];
        }
        const res = await axios.post<{ id: string }>(
          `${GRAPH_API}/${igUserId}/media`,
          mediaParams,
        );
        containerId = res.data.id;
      }

      // Poll for container readiness
      const ready = await this.waitForContainer(token, containerId);
      if (!ready) {
        return {
          status: PUBLICATION_STATUS.PROCESSING,
          providerPublishId: containerId,
          isRetryable: true,
          errorMessage: 'Container still processing — will retry status check.',
        };
      }

      // Publish
      const publishRes = await axios.post<{ id: string }>(
        `${GRAPH_API}/${igUserId}/media_publish`,
        { access_token: token, creation_id: containerId },
      );
      return {
        status: PUBLICATION_STATUS.PUBLISHED,
        externalPostId: publishRes.data.id,
        isRetryable: false,
      };
    } catch (err: unknown) {
      return this.mapAxiosError(err);
    }
  }

  async getPublicationStatus(
    token: string,
    _account: SocialAccount,
    containerId: string,
  ): Promise<PublishResult> {
    try {
      const res = await axios.get<{ status_code: string; id: string }>(
        `${GRAPH_API}/${containerId}`,
        { params: { access_token: token, fields: 'status_code,id' } },
      );
      if (res.data.status_code === 'FINISHED') {
        return {
          status: PUBLICATION_STATUS.PUBLISHED,
          externalPostId: res.data.id,
          isRetryable: false,
        };
      }
      if (res.data.status_code === 'ERROR') {
        return {
          status: PUBLICATION_STATUS.FAILED,
          isRetryable: false,
          errorCode: 'CONTAINER_ERROR',
        };
      }
      return {
        status: PUBLICATION_STATUS.PROCESSING,
        providerPublishId: containerId,
        isRetryable: true,
      };
    } catch (err: unknown) {
      return this.mapAxiosError(err);
    }
  }

  private async waitForContainer(token: string, containerId: string): Promise<boolean> {
    const deadline = Date.now() + CONTAINER_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, CONTAINER_POLL_INTERVAL_MS));
      const res = await axios.get<{ status_code: string }>(
        `${GRAPH_API}/${containerId}`,
        { params: { access_token: token, fields: 'status_code' } },
      );
      if (res.data.status_code === 'FINISHED') return true;
      if (res.data.status_code === 'ERROR') return false;
    }
    return false;
  }

  private mapAxiosError(err: unknown): PublishResult {
    const e = err as {
      response?: { data?: { error?: { code?: number; message?: string } }; status?: number };
    };
    const igErr = e.response?.data?.error;
    const httpStatus = e.response?.status ?? 0;
    this.logger.error('Instagram API error', igErr ?? err);
    const isRetryable = httpStatus === 429 || httpStatus >= 500;
    return {
      status: PUBLICATION_STATUS.FAILED,
      isRetryable,
      errorCode: igErr?.code?.toString() ?? String(httpStatus),
      errorMessage: igErr?.message ?? 'Instagram API error',
      retryAfterMs: isRetryable ? 60_000 : undefined,
    };
  }
}
