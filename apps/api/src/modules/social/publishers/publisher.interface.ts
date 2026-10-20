import { SocialAccount, MediaAsset } from '@prisma/client';

export const PUBLICATION_STATUS = {
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  UPLOADING: 'UPLOADING',
  PROCESSING: 'PROCESSING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
  RETRY_PENDING: 'RETRY_PENDING',
  REQUIRES_USER_ACTION: 'REQUIRES_USER_ACTION',
  CANCELLED: 'CANCELLED',
} as const;

export type PublicationStatus = (typeof PUBLICATION_STATUS)[keyof typeof PUBLICATION_STATUS];

export const SOCIAL_CAPABILITIES = {
  CAN_PUBLISH_TEXT: 'CAN_PUBLISH_TEXT',
  CAN_PUBLISH_IMAGE: 'CAN_PUBLISH_IMAGE',
  CAN_PUBLISH_VIDEO: 'CAN_PUBLISH_VIDEO',
  CAN_PUBLISH_CAROUSEL: 'CAN_PUBLISH_CAROUSEL',
  CAN_PUBLISH_REEL: 'CAN_PUBLISH_REEL',
  CAN_UPLOAD_DRAFT: 'CAN_UPLOAD_DRAFT',
  REQUIRES_USER_HANDOFF: 'REQUIRES_USER_HANDOFF',
  CAN_READ_METRICS: 'CAN_READ_METRICS',
} as const;

export const ACCOUNT_APPROVAL_STATUS = {
  CONNECTED: 'CONNECTED',
  SCOPES_INCOMPLETE: 'SCOPES_INCOMPLETE',
  APP_REVIEW_PENDING: 'APP_REVIEW_PENDING',
  AUDIT_PENDING: 'AUDIT_PENDING',
  READY: 'READY',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  DISCONNECTED: 'DISCONNECTED',
} as const;

export interface PublishContent {
  body: string;
  callToAction?: string;
  destinationUrl?: string;
  mediaUrls: string[];
  contentType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'REEL';
  title?: string;
}

export interface PublishResult {
  status: PublicationStatus;
  externalPostId?: string;
  providerPublishId?: string;
  providerStatus?: string;
  isRetryable: boolean;
  errorCode?: string;
  errorMessage?: string;
  retryAfterMs?: number;
  userHandoffUrl?: string;
}

export interface MediaValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SocialPublisherInterface {
  readonly provider: string;
  validateContent(
    account: SocialAccount,
    content: PublishContent,
    assets: MediaAsset[],
  ): MediaValidationResult;
  publish(
    decryptedAccessToken: string,
    account: SocialAccount,
    content: PublishContent,
    idempotencyKey: string,
  ): Promise<PublishResult>;
  getPublicationStatus(
    decryptedAccessToken: string,
    account: SocialAccount,
    providerPublishId: string,
  ): Promise<PublishResult>;
}
