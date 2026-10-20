import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_APPROVAL_STATUS, SOCIAL_CAPABILITIES } from './publishers/publisher.interface';

const SUPPORTED_SOCIAL_PROVIDERS = ['meta', 'tiktok', 'snapchat'];
const PROVIDER_MAP: Record<string, string> = {
  meta: 'FACEBOOK',
  tiktok: 'TIKTOK',
  snapchat: 'SNAPCHAT',
};

function resolveCapabilities(
  provider: string,
  _accountType: string,
  scopes: string[],
): string[] {
  const caps: string[] = [];
  if (provider === 'FACEBOOK') {
    if (scopes.includes('pages_manage_posts')) {
      caps.push(
        SOCIAL_CAPABILITIES.CAN_PUBLISH_TEXT,
        SOCIAL_CAPABILITIES.CAN_PUBLISH_IMAGE,
        SOCIAL_CAPABILITIES.CAN_PUBLISH_VIDEO,
        SOCIAL_CAPABILITIES.CAN_PUBLISH_REEL,
      );
    }
    caps.push(SOCIAL_CAPABILITIES.CAN_READ_METRICS);
  } else if (provider === 'INSTAGRAM') {
    if (
      scopes.includes('instagram_content_publish') ||
      scopes.includes('instagram_business_content_publish')
    ) {
      caps.push(
        SOCIAL_CAPABILITIES.CAN_PUBLISH_IMAGE,
        SOCIAL_CAPABILITIES.CAN_PUBLISH_VIDEO,
        SOCIAL_CAPABILITIES.CAN_PUBLISH_CAROUSEL,
        SOCIAL_CAPABILITIES.CAN_PUBLISH_REEL,
      );
    }
  } else if (provider === 'TIKTOK') {
    if (scopes.includes('video.publish')) {
      caps.push(SOCIAL_CAPABILITIES.CAN_PUBLISH_VIDEO, SOCIAL_CAPABILITIES.CAN_UPLOAD_DRAFT);
    }
    caps.push(SOCIAL_CAPABILITIES.CAN_PUBLISH_IMAGE);
  } else if (provider === 'SNAPCHAT') {
    caps.push(SOCIAL_CAPABILITIES.REQUIRES_USER_HANDOFF);
  }
  return caps;
}

function resolveApprovalStatus(
  provider: string,
  scopes: string[],
  hasPageToken: boolean,
): string {
  if (provider === 'FACEBOOK') {
    if (!scopes.includes('pages_manage_posts')) return ACCOUNT_APPROVAL_STATUS.SCOPES_INCOMPLETE;
    if (!hasPageToken) return ACCOUNT_APPROVAL_STATUS.APP_REVIEW_PENDING;
    return ACCOUNT_APPROVAL_STATUS.APP_REVIEW_PENDING; // requires Meta App Review
  }
  if (provider === 'INSTAGRAM') {
    if (
      !scopes.includes('instagram_content_publish') &&
      !scopes.includes('instagram_business_content_publish')
    ) {
      return ACCOUNT_APPROVAL_STATUS.SCOPES_INCOMPLETE;
    }
    return ACCOUNT_APPROVAL_STATUS.APP_REVIEW_PENDING;
  }
  if (provider === 'TIKTOK') {
    if (!scopes.includes('video.publish')) return ACCOUNT_APPROVAL_STATUS.SCOPES_INCOMPLETE;
    return ACCOUNT_APPROVAL_STATUS.AUDIT_PENDING; // public posting requires TikTok audit
  }
  return ACCOUNT_APPROVAL_STATUS.CONNECTED;
}

@Injectable()
export class SocialAccountService {
  private readonly logger = new Logger(SocialAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async syncAccountsFromConnection(
    organizationId: string,
    connectionId: string,
    userId: string,
  ) {
    const connection = await this.prisma.externalConnection.findFirst({
      where: { id: connectionId, organizationId },
    });
    if (!connection) throw new NotFoundException('Connection not found.');
    if (!SUPPORTED_SOCIAL_PROVIDERS.includes(connection.provider)) {
      throw new BadRequestException(
        `Provider ${connection.provider} does not support social account sync.`,
      );
    }

    const scopes = connection.scopes ?? [];

    // Build social account records from connection data
    const accountsToUpsert: Array<{
      provider: string;
      providerAccountId: string;
      accountType: string;
      displayName: string;
      username?: string;
      avatarUrl?: string;
      externalBusinessId?: string;
      capabilities: string[];
      approvalStatus: string;
    }> = [];

    if (connection.provider === 'meta') {
      // Main Facebook page account
      if (connection.externalAccountId) {
        accountsToUpsert.push({
          provider: 'FACEBOOK',
          providerAccountId: connection.externalPageId ?? connection.externalAccountId,
          accountType: connection.externalPageId ? 'PAGE' : 'BUSINESS',
          displayName:
            connection.externalPageName ??
            connection.externalAccountName ??
            'Facebook Account',
          capabilities: resolveCapabilities('FACEBOOK', 'PAGE', scopes),
          approvalStatus: resolveApprovalStatus(
            'FACEBOOK',
            scopes,
            !!connection.externalPageId,
          ),
        });
      }
      // Instagram account linked to the same meta connection
      if (connection.externalAccountId) {
        accountsToUpsert.push({
          provider: 'INSTAGRAM',
          providerAccountId: connection.externalAccountId,
          accountType: 'BUSINESS',
          displayName: connection.externalAccountName ?? 'Instagram Account',
          capabilities: resolveCapabilities('INSTAGRAM', 'BUSINESS', scopes),
          approvalStatus: resolveApprovalStatus('INSTAGRAM', scopes, true),
        });
      }
    } else if (connection.provider === 'tiktok') {
      if (connection.externalAccountId) {
        accountsToUpsert.push({
          provider: 'TIKTOK',
          providerAccountId: connection.externalAccountId,
          accountType: 'CREATOR',
          displayName: connection.externalAccountName ?? 'TikTok Account',
          capabilities: resolveCapabilities('TIKTOK', 'CREATOR', scopes),
          approvalStatus: resolveApprovalStatus('TIKTOK', scopes, true),
        });
      }
    } else if (connection.provider === 'snapchat') {
      if (connection.externalAccountId) {
        accountsToUpsert.push({
          provider: 'SNAPCHAT',
          providerAccountId: connection.externalAccountId,
          accountType: 'PUBLIC_PROFILE',
          displayName: connection.externalAccountName ?? 'Snapchat Account',
          capabilities: resolveCapabilities('SNAPCHAT', 'PUBLIC_PROFILE', scopes),
          approvalStatus: ACCOUNT_APPROVAL_STATUS.CONNECTED,
        });
      }
    }

    const upserted = [];
    for (const acc of accountsToUpsert) {
      const record = await this.prisma.socialAccount.upsert({
        where: {
          organizationId_provider_providerAccountId: {
            organizationId,
            provider: acc.provider,
            providerAccountId: acc.providerAccountId,
          },
        },
        create: {
          organizationId,
          connectionId,
          ...acc,
          lastSyncedAt: new Date(),
        },
        update: {
          displayName: acc.displayName,
          capabilities: acc.capabilities,
          approvalStatus: acc.approvalStatus,
          isActive: true,
          lastSyncedAt: new Date(),
        },
      });
      upserted.push(record);
    }

    const provider = PROVIDER_MAP[connection.provider] ?? connection.provider.toUpperCase();
    await this.audit.log({
      organizationId,
      userId,
      action: 'SOCIAL_ACCOUNTS_SYNCED',
      entity: 'ExternalConnection',
      entityId: connectionId,
      metadata: { provider, accountsFound: upserted.length },
    });

    this.logger.log(
      `Synced ${upserted.length} social accounts for connection ${connectionId} (org=${organizationId})`,
    );
    return upserted;
  }

  async listAccounts(organizationId: string, provider?: string) {
    return this.prisma.socialAccount.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(provider ? { provider } : {}),
      },
      include: {
        connection: {
          select: {
            id: true,
            displayName: true,
            status: true,
            tokenStatus: true,
            tokenExpiresAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getAccount(organizationId: string, id: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id, organizationId },
      include: { connection: true },
    });
    if (!account) throw new NotFoundException('Social account not found.');
    return account;
  }

  async deactivate(organizationId: string, id: string, userId: string) {
    const account = await this.getAccount(organizationId, id);
    await this.prisma.socialAccount.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({
      organizationId,
      userId,
      action: 'SOCIAL_ACCOUNT_DEACTIVATED',
      entity: 'SocialAccount',
      entityId: id,
      metadata: { provider: account.provider, displayName: account.displayName },
    });
  }
}
