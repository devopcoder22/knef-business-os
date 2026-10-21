import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExternalConnectionsService } from '../integrations/external-connections.service';
import { QueueService } from '../../common/services/queue.service';
import { SsrfGuardService } from './ssrf-guard.service';
import { FacebookPagePublisher } from './publishers/facebook-page.publisher';
import { InstagramPublisher } from './publishers/instagram.publisher';
import { TikTokPublisher } from './publishers/tiktok.publisher';
import { SnapchatPublisher } from './publishers/snapchat.publisher';
import {
  SocialPublisherInterface,
  PublishContent,
  PUBLICATION_STATUS,
} from './publishers/publisher.interface';
import {
  QUEUES,
  JOB_TYPES,
  SocialPublishJobData,
  SocialStatusCheckJobData,
} from '@knef/constants';
import type { JobsOptions } from 'bullmq';
import * as crypto from 'crypto';

const CONTENT_DRAFT_PUBLISHABLE = ['APPROVED', 'SCHEDULED'];
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_BASE_MS = 30_000;

@Injectable()
export class PublicationService {
  private readonly logger = new Logger(PublicationService.name);
  private readonly publishers: Map<string, SocialPublisherInterface>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly connections: ExternalConnectionsService,
    private readonly queues: QueueService,
    private readonly ssrf: SsrfGuardService,
    private readonly fb: FacebookPagePublisher,
    private readonly ig: InstagramPublisher,
    private readonly tt: TikTokPublisher,
    private readonly sc: SnapchatPublisher,
  ) {
    this.publishers = new Map<string, SocialPublisherInterface>([
      ['FACEBOOK', fb],
      ['INSTAGRAM', ig],
      ['TIKTOK', tt],
      ['SNAPCHAT', sc],
    ]);
  }

  private async enqueueJob<T>(
    jobType: string,
    data: T,
    opts?: JobsOptions,
  ): Promise<void> {
    await this.queues.enqueue(QUEUES.MARKETING, jobType, data, opts);
  }

  async publishNow(
    organizationId: string,
    userId: string,
    draftId: string,
    socialAccountId: string,
    variantId?: string,
  ) {
    const draft = await this.prisma.contentDraft.findFirst({
      where: { id: draftId, organizationId },
      include: { variants: true },
    });
    if (!draft) throw new NotFoundException('Content draft not found.');
    if (!CONTENT_DRAFT_PUBLISHABLE.includes(draft.status)) {
      throw new BadRequestException(
        `Draft status ${draft.status} is not publishable. Must be APPROVED or SCHEDULED.`,
      );
    }

    const account = await this.prisma.socialAccount.findFirst({
      where: { id: socialAccountId, organizationId, isActive: true },
      include: { connection: true },
    });
    if (!account) throw new NotFoundException('Social account not found.');

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${draftId}:${socialAccountId}:${variantId ?? ''}:${Date.now()}`)
      .digest('hex');

    const attempt = await this.prisma.publicationAttempt.create({
      data: {
        organizationId,
        draftId,
        variantId: variantId ?? null,
        socialAccountId,
        provider: account.provider,
        externalAccountId: account.providerAccountId,
        status: PUBLICATION_STATUS.QUEUED,
        idempotencyKey,
        attemptNumber: 1,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'PUBLICATION_QUEUED',
      entity: 'PublicationAttempt',
      entityId: attempt.id,
      metadata: { draftId, socialAccountId, provider: account.provider },
    });

    const jobData: SocialPublishJobData = {
      attemptId: attempt.id,
      organizationId,
      draftId,
      socialAccountId,
      provider: account.provider,
    };

    await this.enqueueJob<SocialPublishJobData>(JOB_TYPES.SOCIAL_PUBLISH, jobData, {
      jobId: `social-publish:${attempt.id}`,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    return attempt;
  }

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
    if (attempt.status === PUBLICATION_STATUS.PUBLISHED) {
      this.logger.log(`Attempt ${attemptId} already published — idempotent skip`);
      return;
    }

    // Re-check draft status at execution time
    if (!CONTENT_DRAFT_PUBLISHABLE.includes(attempt.draft.status)) {
      await this.failAttempt(
        attempt.id,
        'DRAFT_NOT_PUBLISHABLE',
        `Draft status changed to ${attempt.draft.status}`,
        false,
      );
      return;
    }

    const connection = attempt.socialAccount.connection;
    let decryptedToken: string;
    try {
      decryptedToken = await this.connections.decryptConnectionToken(connection.id);
    } catch {
      await this.failAttempt(attempt.id, 'TOKEN_DECRYPT_FAILED', 'Could not decrypt access token', false);
      return;
    }

    const publisher = this.publishers.get(attempt.provider);
    if (!publisher) {
      await this.failAttempt(attempt.id, 'UNSUPPORTED_PROVIDER', `No publisher for ${attempt.provider}`, false);
      return;
    }

    // Build content
    const variant = attempt.variant;
    const body = variant?.body ?? attempt.draft.body ?? '';
    const cta = variant?.callToAction ?? attempt.draft.callToAction ?? undefined;
    const mediaAssetIds: string[] = (() => {
      try {
        return JSON.parse(String(variant?.mediaAssetIds ?? '[]')) as string[];
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

    // Validate media URLs for SSRF
    for (const asset of assets) {
      await this.ssrf.assertSafeUrl(asset.url);
    }

    const content: PublishContent = {
      body,
      callToAction: cta,
      destinationUrl: attempt.draft.destinationUrl ?? undefined,
      mediaUrls: assets.map((a) => a.url),
      contentType:
        assets.length === 0
          ? 'TEXT'
          : assets.some((a) => a.mimeType.startsWith('video/'))
            ? 'VIDEO'
            : assets.length > 1
              ? 'CAROUSEL'
              : 'IMAGE',
    };

    const validation = publisher.validateContent(attempt.socialAccount, content, assets);
    if (!validation.valid) {
      await this.failAttempt(
        attempt.id,
        'MEDIA_VALIDATION_FAILED',
        validation.errors.join('; '),
        false,
      );
      return;
    }

    await this.prisma.publicationAttempt.update({
      where: { id: attempt.id },
      data: { status: PUBLICATION_STATUS.UPLOADING, attemptedAt: new Date() },
    });

    const result = await publisher.publish(
      decryptedToken,
      attempt.socialAccount,
      content,
      attempt.idempotencyKey,
    );

    await this.prisma.publicationAttempt.update({
      where: { id: attempt.id },
      data: {
        status: result.status,
        externalPostId: result.externalPostId ?? null,
        providerPublishId: result.providerPublishId ?? null,
        providerStatus: result.providerStatus ?? null,
        publishedAt: result.status === PUBLICATION_STATUS.PUBLISHED ? new Date() : null,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        isRetryable: result.isRetryable,
        retryAfter: result.retryAfterMs
          ? new Date(Date.now() + result.retryAfterMs)
          : null,
      },
    });

    if (result.status === PUBLICATION_STATUS.PUBLISHED) {
      await this.onPublishSuccess(attempt.organizationId, attempt.draftId, attempt.id);
    } else if (result.status === PUBLICATION_STATUS.PROCESSING && result.providerPublishId) {
      // Enqueue async status check (e.g. TikTok)
      const checkData: SocialStatusCheckJobData = {
        attemptId: attempt.id,
        organizationId: attempt.organizationId,
        provider: attempt.provider,
        providerPublishId: result.providerPublishId,
        socialAccountId: attempt.socialAccountId,
      };
      await this.enqueueJob<SocialStatusCheckJobData>(JOB_TYPES.SOCIAL_STATUS_CHECK, checkData, {
        jobId: `social-status:${attempt.id}`,
        delay: 15_000,
        attempts: MAX_RETRY_ATTEMPTS,
        backoff: { type: 'exponential', delay: RETRY_BACKOFF_BASE_MS },
        removeOnComplete: 100,
        removeOnFail: 200,
      });
    }

    await this.audit.log({
      organizationId: attempt.organizationId,
      action:
        result.status === PUBLICATION_STATUS.PUBLISHED
          ? 'PUBLICATION_SUCCEEDED'
          : 'PUBLICATION_ATTEMPTED',
      entity: 'PublicationAttempt',
      entityId: attempt.id,
      metadata: {
        provider: attempt.provider,
        status: result.status,
        externalPostId: result.externalPostId,
      },
    });
  }

  async checkPublicationStatus(attemptId: string): Promise<void> {
    const attempt = await this.prisma.publicationAttempt.findUnique({
      where: { id: attemptId },
      include: { socialAccount: { include: { connection: true } } },
    });
    if (!attempt || attempt.status === PUBLICATION_STATUS.PUBLISHED) return;

    const publisher = this.publishers.get(attempt.provider);
    if (!publisher || !attempt.providerPublishId) return;

    let decryptedToken: string;
    try {
      decryptedToken = await this.connections.decryptConnectionToken(
        attempt.socialAccount.connection.id,
      );
    } catch {
      return;
    }

    const result = await publisher.getPublicationStatus(
      decryptedToken,
      attempt.socialAccount,
      attempt.providerPublishId,
    );

    await this.prisma.publicationAttempt.update({
      where: { id: attempt.id },
      data: {
        status: result.status,
        externalPostId: result.externalPostId ?? attempt.externalPostId,
        publishedAt: result.status === PUBLICATION_STATUS.PUBLISHED ? new Date() : null,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        isRetryable: result.isRetryable,
      },
    });

    if (result.status === PUBLICATION_STATUS.PUBLISHED) {
      await this.onPublishSuccess(attempt.organizationId, attempt.draftId, attempt.id);
    }
  }

  async retryAttempt(organizationId: string, attemptId: string, userId: string) {
    const attempt = await this.prisma.publicationAttempt.findFirst({
      where: { id: attemptId, organizationId },
    });
    if (!attempt) throw new NotFoundException('Publication attempt not found.');
    if (!attempt.isRetryable) throw new BadRequestException('This publication attempt is not retryable.');
    if (attempt.attemptNumber >= MAX_RETRY_ATTEMPTS) {
      throw new BadRequestException(
        `Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) reached.`,
      );
    }

    const newAttempt = await this.prisma.publicationAttempt.create({
      data: {
        organizationId,
        draftId: attempt.draftId,
        variantId: attempt.variantId,
        socialAccountId: attempt.socialAccountId,
        provider: attempt.provider,
        externalAccountId: attempt.externalAccountId,
        attemptNumber: attempt.attemptNumber + 1,
        status: PUBLICATION_STATUS.QUEUED,
        idempotencyKey: crypto
          .createHash('sha256')
          .update(`retry:${attempt.id}:${Date.now()}`)
          .digest('hex'),
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'PUBLICATION_RETRY_INITIATED',
      entity: 'PublicationAttempt',
      entityId: newAttempt.id,
      metadata: {
        originalAttemptId: attempt.id,
        attemptNumber: newAttempt.attemptNumber,
      },
    });

    const jobPayload: SocialPublishJobData = {
      attemptId: newAttempt.id,
      organizationId,
      draftId: attempt.draftId,
      socialAccountId: attempt.socialAccountId,
      provider: attempt.provider,
    };

    await this.enqueueJob<SocialPublishJobData>(JOB_TYPES.SOCIAL_PUBLISH, jobPayload, {
      jobId: `social-publish:${newAttempt.id}`,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    return newAttempt;
  }

  async handleWebhookEvent(
    organizationId: string,
    provider: string,
    eventId: string,
    publishId: string,
    succeeded: boolean,
    externalPostId?: string,
  ) {
    // Idempotency: skip already processed events
    const existing = await this.prisma.publicationAttempt.findFirst({
      where: { providerEventId: eventId, organizationId },
    });
    if (existing) {
      this.logger.log(`Webhook event ${eventId} already processed — skipping`);
      return;
    }

    const attempt = await this.prisma.publicationAttempt.findFirst({
      where: { providerPublishId: publishId, organizationId, provider },
    });
    if (!attempt) return;

    const status = succeeded ? PUBLICATION_STATUS.PUBLISHED : PUBLICATION_STATUS.FAILED;
    await this.prisma.publicationAttempt.update({
      where: { id: attempt.id },
      data: {
        status,
        externalPostId: externalPostId ?? attempt.externalPostId,
        publishedAt: succeeded ? new Date() : null,
        providerEventId: eventId,
        errorCode: succeeded ? null : 'WEBHOOK_FAILED',
      },
    });

    if (succeeded) {
      await this.onPublishSuccess(organizationId, attempt.draftId, attempt.id);
    }
  }

  async listTargets(organizationId: string, draftId: string) {
    const draft = await this.prisma.contentDraft.findFirst({
      where: { id: draftId, organizationId },
    });
    if (!draft) throw new NotFoundException('Content draft not found.');

    return this.prisma.socialPublicationTarget.findMany({
      where: { draftId, organizationId, isCancelled: false },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            displayName: true,
            username: true,
            avatarUrl: true,
            approvalStatus: true,
            capabilities: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listAttempts(organizationId: string, draftId: string) {
    return this.prisma.publicationAttempt.findMany({
      where: { organizationId, draftId },
      include: {
        socialAccount: {
          select: { provider: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async onPublishSuccess(
    organizationId: string,
    draftId: string,
    attemptId: string,
  ) {
    // Check if ALL required attempts for this draft succeeded
    const allAttempts = await this.prisma.publicationAttempt.findMany({
      where: { draftId, organizationId },
    });
    const anyPending = allAttempts.some(
      (a) =>
        a.id !== attemptId &&
        (
          [
            PUBLICATION_STATUS.PENDING,
            PUBLICATION_STATUS.QUEUED,
            PUBLICATION_STATUS.UPLOADING,
            PUBLICATION_STATUS.PROCESSING,
          ] as string[]
        ).includes(a.status),
    );

    if (!anyPending) {
      await this.prisma.contentDraft.update({
        where: { id: draftId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      await this.audit.log({
        organizationId,
        action: 'CONTENT_DRAFT_PUBLISHED',
        entity: 'ContentDraft',
        entityId: draftId,
        metadata: { via: 'social_publishing', attemptId },
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
}
