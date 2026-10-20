import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt } from '@knef/utils';
import { PrismaService } from './prisma.service';
import type { WorkerConfig } from '../config/worker.config';

const PUBLICATION_STATUS = {
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  UPLOADING: 'UPLOADING',
  PROCESSING: 'PROCESSING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
} as const;

interface ProviderResult {
  status: string;
  externalPostId?: string;
  providerPublishId?: string;
  isRetryable: boolean;
  errorCode?: string;
  errorMessage?: string;
}

const GRAPH_API = 'https://graph.facebook.com/v26.0';
const TIKTOK_API = 'https://open.tiktokapis.com';

@Injectable()
export class SocialPublisherService {
  private readonly logger = new Logger(SocialPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  async executePublish(attemptId: string): Promise<void> {
    const attempt = await this.prisma.publicationAttempt.findUnique({
      where: { id: attemptId },
      include: {
        draft: { include: { variants: true } },
        socialAccount: { include: { connection: true } },
        variant: true,
      },
    });

    if (!attempt) {
      this.logger.error(`PublicationAttempt ${attemptId} not found`);
      return;
    }

    // Idempotency
    if (attempt.status === PUBLICATION_STATUS.PUBLISHED) {
      this.logger.log(`Attempt ${attemptId} already PUBLISHED — skipping`);
      return;
    }

    // Draft must be APPROVED or SCHEDULED
    if (!['APPROVED', 'SCHEDULED'].includes(attempt.draft.status)) {
      await this.failAttempt(
        attempt.id,
        'DRAFT_NOT_PUBLISHABLE',
        `Draft status ${attempt.draft.status} is not publishable`,
        false,
      );
      return;
    }

    const connection = attempt.socialAccount.connection;
    let token: string;
    try {
      const encKey = this.encryptionKey;
      if (!connection.accessTokenEncrypted) throw new Error('No token');
      token = decrypt(connection.accessTokenEncrypted, encKey);
    } catch {
      await this.failAttempt(attempt.id, 'TOKEN_DECRYPT_FAILED', 'Could not decrypt token', false);
      return;
    }

    await this.prisma.publicationAttempt.update({
      where: { id: attempt.id },
      data: { status: PUBLICATION_STATUS.UPLOADING, attemptedAt: new Date() },
    });

    const body = attempt.variant?.body ?? attempt.draft.body ?? '';
    const mediaAssetIds: string[] = (() => {
      try {
        return JSON.parse(String(attempt.variant?.mediaAssetIds ?? '[]')) as string[];
      } catch {
        return [];
      }
    })();

    const assets =
      mediaAssetIds.length > 0
        ? await this.prisma.mediaAsset.findMany({
            where: { id: { in: mediaAssetIds }, organizationId: attempt.organizationId },
          })
        : [];

    const mediaUrls = assets.map((a) => a.url);

    try {
      let status = PUBLICATION_STATUS.FAILED as string;
      let externalPostId: string | undefined;
      let providerPublishId: string | undefined;
      let isRetryable = false;
      let errorCode: string | undefined;
      let errorMessage: string | undefined;

      switch (attempt.provider) {
        case 'FACEBOOK': {
          const result = await this.publishFacebook(
            token,
            attempt.socialAccount.providerAccountId,
            body,
            mediaUrls,
          );
          status = result.status;
          externalPostId = result.externalPostId;
          isRetryable = result.isRetryable;
          errorCode = result.errorCode;
          errorMessage = result.errorMessage;
          break;
        }
        case 'INSTAGRAM': {
          const result = await this.publishInstagram(
            token,
            attempt.socialAccount.providerAccountId,
            body,
            mediaUrls,
          );
          status = result.status;
          externalPostId = result.externalPostId;
          providerPublishId = result.providerPublishId;
          isRetryable = result.isRetryable;
          errorCode = result.errorCode;
          errorMessage = result.errorMessage;
          break;
        }
        case 'TIKTOK': {
          const result = await this.publishTikTok(token, body, mediaUrls);
          status = result.status;
          providerPublishId = result.providerPublishId;
          isRetryable = result.isRetryable;
          errorCode = result.errorCode;
          errorMessage = result.errorMessage;
          break;
        }
        case 'SNAPCHAT': {
          status = 'REQUIRES_USER_ACTION';
          errorCode = 'FOUNDATION_ONLY';
          errorMessage = 'Snapchat requires partner access (Phase 24E foundation only)';
          isRetryable = false;
          break;
        }
        default: {
          errorCode = 'UNSUPPORTED_PROVIDER';
          errorMessage = `No publisher for ${attempt.provider}`;
          break;
        }
      }

      await this.prisma.publicationAttempt.update({
        where: { id: attempt.id },
        data: {
          status,
          externalPostId: externalPostId ?? null,
          providerPublishId: providerPublishId ?? null,
          publishedAt: status === PUBLICATION_STATUS.PUBLISHED ? new Date() : null,
          errorCode: errorCode ?? null,
          errorMessage: errorMessage ?? null,
          isRetryable,
        },
      });

      if (status === PUBLICATION_STATUS.PUBLISHED) {
        await this.onPublishSuccess(attempt.organizationId, attempt.draftId, attempt.id);
      }
    } catch (err) {
      this.logger.error(`publish error for attempt ${attemptId}`, err);
      await this.failAttempt(attempt.id, 'INTERNAL_ERROR', String(err), true);
    }
  }

  async checkPublicationStatus(
    attemptId: string,
    provider: string,
    providerPublishId: string,
  ): Promise<void> {
    const attempt = await this.prisma.publicationAttempt.findUnique({
      where: { id: attemptId },
      include: { socialAccount: { include: { connection: true } } },
    });
    if (!attempt || attempt.status === PUBLICATION_STATUS.PUBLISHED) return;

    let token: string;
    try {
      const encKey = this.encryptionKey;
      if (!attempt.socialAccount.connection.accessTokenEncrypted) throw new Error('No token');
      token = decrypt(attempt.socialAccount.connection.accessTokenEncrypted, encKey);
    } catch {
      return;
    }

    let status = attempt.status;
    let externalPostId: string | undefined;
    let isRetryable = false;

    if (provider === 'TIKTOK') {
      const result = await this.checkTikTokStatus(token, providerPublishId);
      status = result.status;
      externalPostId = result.externalPostId;
      isRetryable = result.isRetryable;
    } else if (provider === 'INSTAGRAM') {
      const result = await this.checkInstagramStatus(token, providerPublishId);
      status = result.status;
      externalPostId = result.externalPostId;
      isRetryable = result.isRetryable;
    }

    await this.prisma.publicationAttempt.update({
      where: { id: attempt.id },
      data: {
        status,
        externalPostId: externalPostId ?? attempt.externalPostId,
        publishedAt: status === PUBLICATION_STATUS.PUBLISHED ? new Date() : null,
        isRetryable,
      },
    });

    if (status === PUBLICATION_STATUS.PUBLISHED) {
      await this.onPublishSuccess(attempt.organizationId, attempt.draftId, attempt.id);
    }
  }

  // ── Provider implementations ────────────────────────────────────────────────

  private async publishFacebook(
    token: string,
    pageId: string,
    body: string,
    mediaUrls: string[],
  ): Promise<ProviderResult> {
    try {
      const params: Record<string, unknown> = { access_token: token };
      if (body) params.message = body;
      const endpoint = `${GRAPH_API}/${pageId}/feed`;
      if (mediaUrls[0]) params.link = mediaUrls[0];

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json() as { id?: string; error?: { code?: number; message?: string } };
      if (!res.ok || data.error) {
        return {
          status: PUBLICATION_STATUS.FAILED,
          isRetryable: res.status === 429 || res.status >= 500,
          errorCode: data.error?.code?.toString() ?? String(res.status),
          errorMessage: data.error?.message ?? 'Facebook API error',
        };
      }
      return { status: PUBLICATION_STATUS.PUBLISHED, externalPostId: data.id, isRetryable: false };
    } catch (err) {
      this.logger.error('Facebook publish error', err);
      return { status: PUBLICATION_STATUS.FAILED, isRetryable: true, errorMessage: String(err) };
    }
  }

  private async publishInstagram(
    token: string,
    igUserId: string,
    body: string,
    mediaUrls: string[],
  ): Promise<ProviderResult> {
    try {
      const url = mediaUrls[0];
      const isVideo = url?.match(/\.(mp4|mov|avi)(\?|$)/i);
      const mediaParams: Record<string, unknown> = { access_token: token, caption: body };
      if (isVideo) {
        mediaParams.media_type = 'VIDEO';
        mediaParams.video_url = url;
      } else if (url) {
        mediaParams.image_url = url;
      }

      const createRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mediaParams),
      });
      const createData = await createRes.json() as { id?: string; error?: { message?: string } };
      if (!createRes.ok || !createData.id) {
        return {
          status: PUBLICATION_STATUS.FAILED,
          isRetryable: false,
          errorMessage: createData.error?.message ?? 'Instagram container creation failed',
        };
      }

      return {
        status: PUBLICATION_STATUS.PROCESSING,
        providerPublishId: createData.id,
        isRetryable: false,
      };
    } catch (err) {
      this.logger.error('Instagram publish error', err);
      return { status: PUBLICATION_STATUS.FAILED, isRetryable: true, errorMessage: String(err) };
    }
  }

  private async publishTikTok(token: string, body: string, mediaUrls: string[]): Promise<ProviderResult> {
    try {
      const res = await fetch(`${TIKTOK_API}/v2/post/publish/video/init/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: { title: body.slice(0, 2200), privacy_level: 'SELF_ONLY' },
          source_info: { source: 'PULL_FROM_URL', video_url: mediaUrls[0] },
        }),
      });
      const data = await res.json() as {
        data?: { publish_id?: string };
        error?: { code?: string; message?: string };
      };
      if (!res.ok || (data.error?.code && data.error.code !== 'ok')) {
        return {
          status: PUBLICATION_STATUS.FAILED,
          isRetryable: false,
          errorCode: data.error?.code,
          errorMessage: data.error?.message ?? 'TikTok API error',
        };
      }
      return {
        status: PUBLICATION_STATUS.PROCESSING,
        providerPublishId: data.data?.publish_id,
        isRetryable: false,
      };
    } catch (err) {
      this.logger.error('TikTok publish error', err);
      return { status: PUBLICATION_STATUS.FAILED, isRetryable: true, errorMessage: String(err) };
    }
  }

  private async checkTikTokStatus(token: string, publishId: string): Promise<ProviderResult> {
    try {
      const res = await fetch(`${TIKTOK_API}/v2/post/publish/status/fetch/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      });
      const data = await res.json() as {
        data?: { status?: string; publicaly_available_post_id?: string[] };
        error?: { code?: string };
      };
      const s = data.data?.status;
      if (s === 'PUBLISH_COMPLETE') {
        return {
          status: PUBLICATION_STATUS.PUBLISHED,
          externalPostId: data.data?.publicaly_available_post_id?.[0],
          isRetryable: false,
        };
      }
      if (s === 'FAILED') {
        return { status: PUBLICATION_STATUS.FAILED, isRetryable: false };
      }
      return { status: PUBLICATION_STATUS.PROCESSING, isRetryable: true };
    } catch {
      return { status: PUBLICATION_STATUS.PROCESSING, isRetryable: true };
    }
  }

  private async checkInstagramStatus(token: string, containerId: string): Promise<ProviderResult> {
    try {
      const res = await fetch(
        `${GRAPH_API}/${containerId}?access_token=${encodeURIComponent(token)}&fields=status_code,id`,
      );
      const data = await res.json() as { status_code?: string; id?: string };
      if (data.status_code === 'FINISHED') {
        return { status: PUBLICATION_STATUS.PUBLISHED, externalPostId: data.id, isRetryable: false };
      }
      if (data.status_code === 'ERROR') {
        return { status: PUBLICATION_STATUS.FAILED, isRetryable: false };
      }
      return { status: PUBLICATION_STATUS.PROCESSING, isRetryable: true };
    } catch {
      return { status: PUBLICATION_STATUS.PROCESSING, isRetryable: true };
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async onPublishSuccess(
    organizationId: string,
    draftId: string,
    attemptId: string,
  ) {
    const allAttempts = await this.prisma.publicationAttempt.findMany({
      where: { draftId, organizationId },
    });
    const anyPending = allAttempts.some(
      (a) =>
        a.id !== attemptId &&
        (['PENDING', 'QUEUED', 'UPLOADING', 'PROCESSING'] as string[]).includes(a.status),
    );
    if (!anyPending) {
      await this.prisma.contentDraft.update({
        where: { id: draftId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    }
  }

  private async failAttempt(
    id: string,
    code: string,
    message: string,
    isRetryable: boolean,
  ) {
    await this.prisma.publicationAttempt.update({
      where: { id },
      data: {
        status: PUBLICATION_STATUS.FAILED,
        errorCode: code,
        errorMessage: message,
        isRetryable,
        attemptedAt: new Date(),
      },
    });
  }

  private get encryptionKey(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }
}
