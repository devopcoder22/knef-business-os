/**
 * EmailProcessor — unit tests
 *
 * Verifies campaign email processing, recipient status updates,
 * and campaign finalization logic.
 */

import { EmailProcessor } from './email.processor';
import { EmailSenderService } from '../services/email-sender.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    emailCampaignRecipient: {
      update: jest.fn(async () => null),
      count: jest.fn(async () => 0),
    },
    emailCampaign: {
      updateMany: jest.fn(async () => null),
    },
    ...overrides,
  };
}

function makeEmailSender(result: { success: boolean; messageId?: string; error?: string } = { success: true, messageId: 'msg-1' }) {
  return { sendEmail: jest.fn(async () => result) } as unknown as EmailSenderService;
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, def?: unknown) => overrides[key] ?? def),
  };
}

// ── Campaign email processing ─────────────────────────────────────────────────

describe('EmailProcessor — campaign email job', () => {
  it('1: successful send → updates recipient status to SENT', async () => {
    const prisma = makePrisma();
    const emailSender = makeEmailSender({ success: true, messageId: 'msg-ok' });
    const config = makeConfig();

    const processor = new EmailProcessor(
      prisma as never,
      emailSender,
      config as never,
    );

    await (processor as unknown as { processCampaignEmail: (d: unknown) => Promise<void> })
      .processCampaignEmail({
        campaignId: 'camp-1',
        recipientId: 'rec-1',
        organizationId: 'org-1',
        to: 'test@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      });

    const updateCall = (prisma.emailCampaignRecipient.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where.id).toBe('rec-1');
    expect(updateCall.data.status).toBe('SENT');
    expect(updateCall.data.providerMessageId).toBe('msg-ok');
  });

  it('2: failed send → updates recipient status to FAILED', async () => {
    const prisma = makePrisma();
    const emailSender = makeEmailSender({ success: false, error: 'SMTP timeout' });
    const config = makeConfig();

    const processor = new EmailProcessor(
      prisma as never,
      emailSender,
      config as never,
    );

    await expect(
      (processor as unknown as { processCampaignEmail: (d: unknown) => Promise<void> })
        .processCampaignEmail({
          campaignId: 'camp-1',
          recipientId: 'rec-1',
          organizationId: 'org-1',
          to: 'test@example.com',
          subject: 'Hello',
          html: '<p>Hi</p>',
          text: 'Hi',
        }),
    ).rejects.toThrow('SMTP timeout');

    const updateCall = (prisma.emailCampaignRecipient.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.status).toBe('FAILED');
    expect(updateCall.data.errorMessage).toBe('SMTP timeout');
  });

  it('3: when no PENDING recipients remain → campaign finalized as SENT', async () => {
    const prisma = makePrisma({
      emailCampaignRecipient: {
        update: jest.fn(async () => null),
        count: jest.fn(async (args: { where: { status: string } }) => {
          if (args.where.status === 'PENDING') return 0; // none pending
          if (args.where.status === 'SENT') return 5;
          if (args.where.status === 'FAILED') return 1;
          return 0;
        }),
      },
      emailCampaign: {
        updateMany: jest.fn(async () => null),
      },
    });
    const emailSender = makeEmailSender({ success: true, messageId: 'x' });
    const config = makeConfig();

    const processor = new EmailProcessor(
      prisma as never,
      emailSender,
      config as never,
    );

    await (processor as unknown as { processCampaignEmail: (d: unknown) => Promise<void> })
      .processCampaignEmail({
        campaignId: 'camp-1',
        recipientId: 'rec-1',
        organizationId: 'org-1',
        to: 'a@b.com',
        subject: 'S',
        html: '<p></p>',
        text: '',
      });

    const finalizeCall = (prisma.emailCampaign.updateMany as jest.Mock).mock.calls[0][0];
    expect(finalizeCall.data.status).toBe('SENT');
    expect(finalizeCall.data.sentCount).toBe(5);
    expect(finalizeCall.data.bounceCount).toBe(1);
  });

  it('4: when PENDING recipients remain → campaign NOT yet finalized', async () => {
    const prisma = makePrisma({
      emailCampaignRecipient: {
        update: jest.fn(async () => null),
        count: jest.fn(async () => 3), // 3 still pending
      },
      emailCampaign: {
        updateMany: jest.fn(async () => null),
      },
    });
    const emailSender = makeEmailSender({ success: true, messageId: 'x' });
    const config = makeConfig();

    const processor = new EmailProcessor(
      prisma as never,
      emailSender,
      config as never,
    );

    await (processor as unknown as { processCampaignEmail: (d: unknown) => Promise<void> })
      .processCampaignEmail({
        campaignId: 'camp-1',
        recipientId: 'rec-1',
        organizationId: 'org-1',
        to: 'a@b.com',
        subject: 'S',
        html: '<p></p>',
        text: '',
      });

    expect((prisma.emailCampaign.updateMany as jest.Mock).mock.calls.length).toBe(0);
  });
});

// ── Email sender delegation ───────────────────────────────────────────────────

describe('EmailProcessor — email sender delegation', () => {
  it('5: passes correct params to emailSender.sendEmail', async () => {
    const prisma = makePrisma();
    const emailSender = makeEmailSender({ success: true, messageId: 'msg' });
    const config = makeConfig();

    const processor = new EmailProcessor(
      prisma as never,
      emailSender,
      config as never,
    );

    await (processor as unknown as { processCampaignEmail: (d: unknown) => Promise<void> })
      .processCampaignEmail({
        campaignId: 'camp-1',
        recipientId: 'rec-1',
        organizationId: 'org-1',
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<b>Bold</b>',
        text: 'Bold',
        from: 'KNEF <noreply@knef.com>',
        providerId: 'prov-1',
      });

    const [sendArgs] = (emailSender.sendEmail as jest.Mock).mock.calls[0];
    expect(sendArgs.to).toBe('user@example.com');
    expect(sendArgs.subject).toBe('Test Subject');
    expect(sendArgs.organizationId).toBe('org-1');
    expect(sendArgs.providerId).toBe('prov-1');
  });
});
