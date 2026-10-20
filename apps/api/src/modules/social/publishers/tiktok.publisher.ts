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

const TIKTOK_API = 'https://open.tiktokapis.com';

interface CreatorInfo {
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

interface VideoInitResponse {
  publish_id: string;
  upload_url: string;
}

@Injectable()
export class TikTokPublisher implements SocialPublisherInterface {
  readonly provider = 'TIKTOK';
  private readonly logger = new Logger(TikTokPublisher.name);

  validateContent(
    _account: SocialAccount,
    content: PublishContent,
    assets: MediaAsset[],
  ): MediaValidationResult {
    const errors: string[] = [];
    if (content.contentType === 'TEXT') {
      errors.push('TikTok does not support text-only posts.');
    }
    for (const asset of assets) {
      if (asset.mimeType.startsWith('video/') && asset.size > 4_000_000_000) {
        errors.push(`Video ${asset.filename} exceeds 4 GB TikTok limit.`);
      }
      if (asset.size === 0) {
        errors.push(`Asset ${asset.filename} has zero size.`);
      }
    }
    if (content.mediaUrls.length === 0) {
      errors.push('TikTok requires at least one media URL.');
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(
    token: string,
    account: SocialAccount,
    content: PublishContent,
    _idempotencyKey: string,
  ): Promise<PublishResult> {
    try {
      // Fetch creator info for privacy settings
      const creatorInfo = await this.getCreatorInfo(token);
      const privacyLevel = creatorInfo.privacy_level_options.includes('PUBLIC_TO_EVERYONE')
        ? 'PUBLIC_TO_EVERYONE'
        : (creatorInfo.privacy_level_options[0] ?? 'SELF_ONLY');

      const isVideo = content.contentType === 'VIDEO' || content.contentType === 'REEL';
      const endpoint = isVideo
        ? `${TIKTOK_API}/v2/post/publish/video/init/`
        : `${TIKTOK_API}/v2/post/publish/content/init/`;

      const body: Record<string, unknown> = {
        post_info: {
          title: content.body.slice(0, 2200),
          privacy_level: privacyLevel,
          disable_duet: creatorInfo.duet_disabled,
          disable_comment: creatorInfo.comment_disabled,
          disable_stitch: creatorInfo.stitch_disabled,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: content.mediaUrls[0],
        },
      };

      if (!isVideo) {
        body.media_type = 'PHOTO';
        (body.source_info as Record<string, unknown>)['photo_images'] = content.mediaUrls;
        delete (body.source_info as Record<string, unknown>)['video_url'];
      }

      const res = await axios.post<{
        data: VideoInitResponse;
        error: { code: string; message: string };
      }>(endpoint, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      });

      if (res.data.error?.code && res.data.error.code !== 'ok') {
        return {
          status: PUBLICATION_STATUS.FAILED,
          isRetryable: false,
          errorCode: res.data.error.code,
          errorMessage: res.data.error.message,
        };
      }

      void account;
      return {
        status: PUBLICATION_STATUS.PROCESSING,
        providerPublishId: res.data.data.publish_id,
        isRetryable: false,
      };
    } catch (err: unknown) {
      return this.mapAxiosError(err);
    }
  }

  async getPublicationStatus(
    token: string,
    _account: SocialAccount,
    publishId: string,
  ): Promise<PublishResult> {
    try {
      const res = await axios.post<{
        data: {
          status: string;
          fail_reason?: string;
          publicaly_available_post_id?: string[];
        };
        error: { code: string; message: string };
      }>(
        `${TIKTOK_API}/v2/post/publish/status/fetch/`,
        { publish_id: publishId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        },
      );

      if (res.data.error?.code && res.data.error.code !== 'ok') {
        return {
          status: PUBLICATION_STATUS.FAILED,
          isRetryable: false,
          errorCode: res.data.error.code,
          errorMessage: res.data.error.message,
        };
      }

      const s = res.data.data.status;
      if (s === 'PUBLISH_COMPLETE') {
        const postId = res.data.data.publicaly_available_post_id?.[0];
        return {
          status: PUBLICATION_STATUS.PUBLISHED,
          externalPostId: postId,
          isRetryable: false,
        };
      }
      if (s === 'FAILED') {
        return {
          status: PUBLICATION_STATUS.FAILED,
          isRetryable: false,
          errorCode: 'TIKTOK_PUBLISH_FAILED',
          errorMessage: res.data.data.fail_reason ?? 'TikTok publish failed',
        };
      }
      // IN_PROGRESS, PROCESSING_DOWNLOAD, PROCESSING_UPLOAD, SEND_TO_USER_INBOX
      return {
        status: PUBLICATION_STATUS.PROCESSING,
        providerPublishId: publishId,
        isRetryable: true,
      };
    } catch (err: unknown) {
      return this.mapAxiosError(err);
    }
  }

  private async getCreatorInfo(token: string): Promise<CreatorInfo> {
    const res = await axios.post<{ data: CreatorInfo; error: { code: string } }>(
      `${TIKTOK_API}/v2/post/publish/creator_info/query/`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.data.error?.code && res.data.error.code !== 'ok') {
      this.logger.warn('Failed to fetch TikTok creator info, using defaults');
      return {
        privacy_level_options: ['SELF_ONLY'],
        comment_disabled: false,
        duet_disabled: false,
        stitch_disabled: false,
        max_video_post_duration_sec: 60,
      };
    }
    return res.data.data;
  }

  private mapAxiosError(err: unknown): PublishResult {
    const e = err as { response?: { status?: number; data?: unknown } };
    const httpStatus = e.response?.status ?? 0;
    this.logger.error('TikTok API error', e.response?.data ?? err);
    const isRetryable = httpStatus === 429 || httpStatus >= 500;
    return {
      status: PUBLICATION_STATUS.FAILED,
      isRetryable,
      errorCode: String(httpStatus),
      errorMessage: 'TikTok API error',
      retryAfterMs: isRetryable ? 60_000 : undefined,
    };
  }
}
