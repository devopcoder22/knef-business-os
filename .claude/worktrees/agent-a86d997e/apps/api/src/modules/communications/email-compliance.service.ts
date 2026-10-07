import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { EmailSubscriptionService } from './email-subscription.service';

export interface ComplianceCheckItem {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ComplianceReport {
  campaignId: string;
  allPassed: boolean;
  checks: ComplianceCheckItem[];
  summary: {
    totalRecipients: number;
    eligibleRecipients: number;
    suppressedRecipients: number;
    estimatedSendSize: number;
  };
}

@Injectable()
export class EmailComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: EmailSubscriptionService,
  ) {}

  async runChecks(organizationId: string, campaignId: string): Promise<ComplianceReport> {
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id: campaignId, organizationId },
      include: { provider: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const recipients = await this.prisma.emailCampaignRecipient.findMany({
      where: { campaignId },
      select: { email: true },
    });

    const allEmails = recipients.map((r) => r.email);
    const isMarketing = campaign.campaignType !== 'TRANSACTIONAL';

    const filterResult = isMarketing
      ? await this.subscriptionService.filterEligibleRecipients(allEmails, organizationId, campaign.subscriptionList)
      : { eligible: allEmails, suppressed: [], total: allEmails.length };

    const checks: ComplianceCheckItem[] = [
      {
        key: 'provider_configured',
        label: 'Email provider configured',
        passed: !!(campaign.provider || campaign.providerId),
        detail: campaign.provider ? `Using: ${campaign.provider.name}` : 'No provider assigned',
      },
      {
        key: 'subject_present',
        label: 'Subject line present',
        passed: !!(campaign.subject && campaign.subject.trim().length > 0),
        detail: campaign.subject ? `Subject: "${campaign.subject}"` : 'Missing subject',
      },
      {
        key: 'content_present',
        label: 'Email content present',
        passed: !!(campaign.htmlContent || campaign.textContent),
        detail: campaign.htmlContent ? 'HTML content provided' : campaign.textContent ? 'Text-only content' : 'No content',
      },
      {
        key: 'recipients_present',
        label: 'Recipients added',
        passed: allEmails.length > 0,
        detail: `${allEmails.length} recipient(s) added`,
      },
      {
        key: 'eligible_recipients',
        label: 'Eligible recipients after suppression',
        passed: filterResult.eligible.length > 0,
        detail: `${filterResult.eligible.length} eligible, ${filterResult.suppressed.length} suppressed`,
      },
    ];

    if (isMarketing) {
      checks.push({
        key: 'unsubscribe_mechanism',
        label: 'Unsubscribe mechanism present (check template)',
        passed: !!(campaign.htmlContent?.includes('{{unsubscribe_url}}') || campaign.htmlContent?.includes('unsubscribe')),
        detail: 'Marketing emails must include an unsubscribe link',
      });
    }

    const allPassed = checks.every((c) => c.passed);

    return {
      campaignId,
      allPassed,
      checks,
      summary: {
        totalRecipients: allEmails.length,
        eligibleRecipients: filterResult.eligible.length,
        suppressedRecipients: filterResult.suppressed.length,
        estimatedSendSize: filterResult.eligible.length,
      },
    };
  }
}
