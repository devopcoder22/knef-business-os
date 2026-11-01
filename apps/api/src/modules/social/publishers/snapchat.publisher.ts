import { Injectable } from '@nestjs/common';
import { SocialAccount, MediaAsset } from '@prisma/client';
import {
  SocialPublisherInterface,
  PublishContent,
  PublishResult,
  MediaValidationResult,
  PUBLICATION_STATUS,
} from './publisher.interface';

/**
 * Snapchat — FOUNDATION ONLY (Phase 24E).
 *
 * Snapchat Public Profiles API requires partner-level access and AES-256-CBC
 * media encryption. Full implementation is deferred pending partner approval
 * and SDK access. Creative Kit (user-handoff) is client-side only.
 */
@Injectable()
export class SnapchatPublisher implements SocialPublisherInterface {
  readonly provider = 'SNAPCHAT';

  validateContent(
    _account: SocialAccount,
    _content: PublishContent,
    _assets: MediaAsset[],
  ): MediaValidationResult {
    return {
      valid: false,
      errors: [
        'Snapchat publishing is FOUNDATION ONLY in Phase 24E — partner access required.',
      ],
    };
  }

  async publish(
    _token: string,
    _account: SocialAccount,
    _content: PublishContent,
    _idempotencyKey: string,
  ): Promise<PublishResult> {
    return {
      status: PUBLICATION_STATUS.REQUIRES_USER_ACTION,
      isRetryable: false,
      errorCode: 'FOUNDATION_ONLY',
      errorMessage:
        'Snapchat server-side publishing requires Snap Public Profile partner access (Phase 24E foundation only).',
    };
  }

  async getPublicationStatus(
    _token: string,
    _account: SocialAccount,
    _publishId: string,
  ): Promise<PublishResult> {
    return {
      status: PUBLICATION_STATUS.REQUIRES_USER_ACTION,
      isRetryable: false,
      errorCode: 'FOUNDATION_ONLY',
    };
  }
}
