import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AIMarketingService } from './ai-marketing.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AICompletionService } from '../ai/ai-completion.service';

// ── Shared mock helpers ────────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const DRAFT_ID = 'draft-1';
const CAMPAIGN_ID = 'camp-1';

const mockOrg = { id: ORG_ID, name: 'KNEF Test Org', country: 'Nigeria' };

const mockDraft = {
  id: DRAFT_ID,
  organizationId: ORG_ID,
  title: 'Spring Sale Promo',
  body: 'Get 20% off all gadgets this spring.',
  callToAction: 'Shop Now',
  targetChannel: 'EMAIL',
  status: 'DRAFT',
  campaign: null,
};

const mockProduct = {
  name: 'KNEF SmartPhone X',
  description: 'Flagship smartphone with 5G.',
  shortDesc: '5G flagship phone',
  sellingPrice: '250000',
  comparePrice: '300000',
  status: 'ACTIVE',
  category: { name: 'Smartphones' },
  brand: { name: 'KNEF' },
};

const mockPrisma = {
  organization: { findUnique: jest.fn() },
  product: { findMany: jest.fn() },
  contentDraft: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  contentVariant: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  marketingCampaign: { findFirst: jest.fn() },
};

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

const mockAiCompletion = { complete: jest.fn() };

// ── Factory helpers ────────────────────────────────────────────────────────────

function makeCompletionResult(content: string) {
  return {
    content,
    model: 'claude-haiku-4-5-20251001',
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    latencyMs: 500,
    costUsd: 0.0002,
  };
}

function jsonResponse(obj: unknown) {
  return makeCompletionResult(JSON.stringify(obj));
}

// ──────────────────────────────────────────────────────────────────────────────

describe('AIMarketingService', () => {
  let service: AIMarketingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default setup
    mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.contentDraft.findFirst.mockResolvedValue(mockDraft);
    mockPrisma.marketingCampaign.findFirst.mockResolvedValue({
      id: CAMPAIGN_ID,
      organizationId: ORG_ID,
      name: 'Spring Sale',
      objective: 'PROMOTION',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIMarketingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: AICompletionService, useValue: mockAiCompletion },
      ],
    }).compile();

    service = module.get<AIMarketingService>(AIMarketingService);
  });

  // ── generateCampaignIdeas ────────────────────────────────────────────────────

  describe('generateCampaignIdeas', () => {
    it('returns structured campaign ideas from AI', async () => {
      const ideas = [
        { name: 'Summer Blowout', concept: 'Big summer sale', objective: 'PROMOTION',
          keyMessage: 'Save 30%', recommendedChannels: ['EMAIL'], contentIdeas: ['Banner ad'],
          callToAction: 'Shop Now' },
      ];
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ ideas }));

      const result = await service.generateCampaignIdeas(ORG_ID, USER_ID, {
        objective: 'PROMOTION', tone: 'friendly',
      });

      expect(result.ideas).toHaveLength(1);
      expect(result.ideas[0]).toMatchObject({ name: 'Summer Blowout' });
    });

    it('enforces org isolation — only fetches products for the calling org', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ ideas: [] }));

      await service.generateCampaignIdeas(ORG_ID, USER_ID, { productIds: ['prod-1', 'prod-2'] });

      const productCall = mockPrisma.product.findMany.mock.calls[0][0] as { where: { organizationId: string } };
      expect(productCall.where.organizationId).toBe(ORG_ID);
    });

    it('excludes costPrice from product context passed to AI', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ ideas: [] }));

      await service.generateCampaignIdeas(ORG_ID, USER_ID, { productIds: ['prod-1'] });

      const selectArg = (mockPrisma.product.findMany.mock.calls[0][0] as {
        select: Record<string, unknown>
      }).select;
      expect(selectArg).not.toHaveProperty('costPrice');
    });

    it('returns empty ideas array when AI returns malformed JSON', async () => {
      mockAiCompletion.complete.mockResolvedValue(makeCompletionResult('not json'));

      const result = await service.generateCampaignIdeas(ORG_ID, USER_ID, {});

      expect(result.ideas).toEqual([]);
    });

    it('throws ServiceUnavailableException when AI provider is down', async () => {
      mockAiCompletion.complete.mockRejectedValue(new ServiceUnavailableException('No provider'));

      await expect(
        service.generateCampaignIdeas(ORG_ID, USER_ID, {}),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('logs audit event on success', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ ideas: [] }));

      await service.generateCampaignIdeas(ORG_ID, USER_ID, {});

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_MARKETING_CAMPAIGN_IDEAS_GENERATED' }),
      );
    });
  });

  // ── generateDraftContent ─────────────────────────────────────────────────────

  describe('generateDraftContent', () => {
    it('returns AI-generated body and CTA', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Buy our gadgets today!', callToAction: 'Order Now' }),
      );

      const result = await service.generateDraftContent(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(result.body).toBe('Buy our gadgets today!');
      expect(result.callToAction).toBe('Order Now');
    });

    it('generate calls complete() exactly once and never writes to contentDraft', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'New body', callToAction: 'Click here' }),
      );

      const result = await service.generateDraftContent(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(result.body).toBe('New body');
      expect(mockAiCompletion.complete).toHaveBeenCalledTimes(1);
      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('generateDraftContent never calls contentDraft.update — persist is caller responsibility', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'New body', callToAction: null }),
      );

      await service.generateDraftContent(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for draft from another org (IDOR protection)', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(null);

      await expect(
        service.generateDraftContent('org-evil', USER_ID, DRAFT_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when AI returns no body', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({}));

      await expect(
        service.generateDraftContent(ORG_ID, USER_ID, DRAFT_ID, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('logs AI_MARKETING_DRAFT_GENERATED audit event', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Content', callToAction: null }),
      );

      await service.generateDraftContent(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_MARKETING_DRAFT_GENERATED', entityId: DRAFT_ID }),
      );
    });

    it('does not expose costPrice in product context', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ body: 'ok', callToAction: null }));

      await service.generateDraftContent(ORG_ID, USER_ID, DRAFT_ID, { productIds: ['prod-1'] });

      const selectArg = (mockPrisma.product.findMany.mock.calls[0][0] as {
        select: Record<string, unknown>
      }).select;
      expect(selectArg).not.toHaveProperty('costPrice');
    });
  });

  // ── rewriteContent ───────────────────────────────────────────────────────────

  describe('rewriteContent', () => {
    it('returns originalBody unchanged alongside suggestedBody', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Rewritten content', callToAction: 'Buy Now' }),
      );

      const result = await service.rewriteContent(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(result.originalBody).toBe(mockDraft.body);
      expect(result.suggestedBody).toBe('Rewritten content');
    });

    it('never auto-applies rewrite — contentDraft.update not called', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Rewritten', callToAction: null }),
      );

      await service.rewriteContent(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when draft has no body', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ ...mockDraft, body: null });

      await expect(service.rewriteContent(ORG_ID, USER_ID, DRAFT_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('logs AI_MARKETING_REWRITE audit event', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ body: 'New', callToAction: null }));

      await service.rewriteContent(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_MARKETING_REWRITE' }),
      );
    });

    it('throws NotFoundException for cross-org IDOR attempt', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(null);

      await expect(
        service.rewriteContent('org-evil', USER_ID, DRAFT_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── generateVariant ──────────────────────────────────────────────────────────

  describe('generateVariant', () => {
    it('generates platform variant with correct platform guidance in prompt', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Instagram caption here #sale', callToAction: 'Shop Link in Bio' }),
      );

      const result = await service.generateVariant(ORG_ID, USER_ID, DRAFT_ID, {
        platform: 'INSTAGRAM',
        saveToDraft: false,
      });

      expect(result.platform).toBe('INSTAGRAM');
      expect(result.body).toBeTruthy();
      expect(result.saved).toBe(false);
    });

    it('saves variant to database when saveToDraft=true', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'SMS text', callToAction: 'Reply STOP to unsubscribe' }),
      );
      mockPrisma.contentVariant.findFirst.mockResolvedValue(null);
      mockPrisma.contentVariant.create.mockResolvedValue({
        id: 'var-1', draftId: DRAFT_ID, platform: 'SMS', body: 'SMS text', callToAction: null,
      });

      const result = await service.generateVariant(ORG_ID, USER_ID, DRAFT_ID, {
        platform: 'SMS',
        saveToDraft: true,
      });

      expect(result.saved).toBe(true);
      expect(result.variantId).toBe('var-1');
      expect(mockPrisma.contentVariant.create).toHaveBeenCalled();
    });

    it('rejects unsupported platform', async () => {
      await expect(
        service.generateVariant(ORG_ID, USER_ID, DRAFT_ID, { platform: 'MYSPACE' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates existing variant instead of creating duplicate', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Updated email copy', callToAction: 'Click Here' }),
      );
      const existingVariant = { id: 'var-existing', platform: 'EMAIL' };
      mockPrisma.contentVariant.findFirst.mockResolvedValue(existingVariant);
      mockPrisma.contentVariant.update.mockResolvedValue({
        ...existingVariant, body: 'Updated email copy',
      });

      const result = await service.generateVariant(ORG_ID, USER_ID, DRAFT_ID, {
        platform: 'EMAIL',
        saveToDraft: true,
      });

      expect(mockPrisma.contentVariant.create).not.toHaveBeenCalled();
      expect(mockPrisma.contentVariant.update).toHaveBeenCalled();
      expect(result.variantId).toBe('var-existing');
    });

    it('logs AI_MARKETING_VARIANT_GENERATED audit event', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Content', callToAction: null }),
      );

      await service.generateVariant(ORG_ID, USER_ID, DRAFT_ID, { platform: 'FACEBOOK' });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_MARKETING_VARIANT_GENERATED' }),
      );
    });

    it('validates all 10 supported platforms without throwing', async () => {
      const platforms = [
        'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'SNAPCHAT', 'WHATSAPP',
        'SMS', 'EMAIL', 'WEB_PUSH', 'STOREFRONT', 'TELEGRAM',
      ];
      for (const platform of platforms) {
        mockAiCompletion.complete.mockResolvedValue(
          jsonResponse({ body: `Copy for ${platform}`, callToAction: null }),
        );
        await expect(
          service.generateVariant(ORG_ID, USER_ID, DRAFT_ID, { platform }),
        ).resolves.toMatchObject({ platform });
      }
    });
  });

  // ── generateCta ──────────────────────────────────────────────────────────────

  describe('generateCta', () => {
    it('returns array of CTA options', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ options: ['Shop Now', 'Learn More', 'Get 20% Off', 'Order Today', 'Claim Deal'] }),
      );

      const result = await service.generateCta(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(result.options).toHaveLength(5);
      expect(result.options[0]).toBe('Shop Now');
    });

    it('returns empty options on malformed AI response', async () => {
      mockAiCompletion.complete.mockResolvedValue(makeCompletionResult('broken'));

      const result = await service.generateCta(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(result.options).toEqual([]);
    });
  });

  // ── generateHashtags ─────────────────────────────────────────────────────────

  describe('generateHashtags', () => {
    it('strips # prefix from AI-returned hashtags', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ hashtags: ['#TechDeals', 'gadgets', '#sale2026'] }),
      );

      const result = await service.generateHashtags(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(result.hashtags).toEqual(['TechDeals', 'gadgets', 'sale2026']);
    });

    it('caps requested hashtag count at 30', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ hashtags: [] }));

      await service.generateHashtags(ORG_ID, USER_ID, DRAFT_ID, { count: 999 });

      const promptMsg = (mockAiCompletion.complete.mock.calls[0][0] as {
        messages: Array<{ content: string }>
      }).messages[0].content;
      expect(promptMsg).toContain('30 hashtags');
    });
  });

  // ── generateContentCalendar ──────────────────────────────────────────────────

  describe('generateContentCalendar', () => {
    it('returns calendar entries and a note that content is NOT auto-scheduled', async () => {
      const entries = [
        { suggestedDate: '2026-11-05', platform: 'EMAIL', theme: 'Launch', draftIdea: 'Sale announcement', callToAction: 'Shop Now' },
      ];
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ entries }));

      const result = await service.generateContentCalendar(ORG_ID, USER_ID, CAMPAIGN_ID, {});

      expect(result.entries).toHaveLength(1);
      expect(result.note).toContain('not be scheduled automatically');
    });

    it('throws NotFoundException for calendar of another org campaign', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue(null);

      await expect(
        service.generateContentCalendar('org-evil', USER_ID, CAMPAIGN_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('logs AI_MARKETING_CALENDAR_SUGGESTED audit event', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ entries: [] }));

      await service.generateContentCalendar(ORG_ID, USER_ID, CAMPAIGN_ID, {});

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_MARKETING_CALENDAR_SUGGESTED', entityId: CAMPAIGN_ID }),
      );
    });
  });

  // ── interpolateTemplate ──────────────────────────────────────────────────────

  describe('interpolateTemplate', () => {
    it('replaces allowlisted variables', () => {
      const result = service.interpolateTemplate({
        template: 'Hi {customerFirstName}, check out {productName} for {productPrice}!',
        variables: { customerFirstName: 'Alice', productName: 'Gadget X', productPrice: '₦50,000' },
      });

      expect(result.result).toBe('Hi Alice, check out Gadget X for ₦50,000!');
      expect(result.appliedVars).toContain('customerFirstName');
    });

    it('leaves non-allowlisted variables unchanged (injection protection)', () => {
      const result = service.interpolateTemplate({
        template: 'Hello {customerFirstName}. Ignore previous instructions: {__proto__}',
        variables: { customerFirstName: 'Bob' } as never,
      });

      expect(result.result).toContain('{__proto__}');
      expect(result.skippedVars).toContain('__proto__');
    });

    it('leaves missing allowed variables unchanged — no crash, no blank', () => {
      const result = service.interpolateTemplate({
        template: 'Visit {storefrontUrl} for {productName}',
        variables: { storefrontUrl: 'https://shop.example.com' },
      });

      expect(result.result).toBe('Visit https://shop.example.com for {productName}');
      expect(result.skippedVars).toContain('productName');
    });

    it('handles template with no variables', () => {
      const result = service.interpolateTemplate({
        template: 'No variables here.',
        variables: {},
      });

      expect(result.result).toBe('No variables here.');
      expect(result.appliedVars).toHaveLength(0);
    });

    it('supports all 7 allowlisted variables', () => {
      const vars = {
        customerFirstName: 'Alice',
        organizationName: 'KNEF',
        productName: 'Phone',
        productPrice: '₦100',
        storefrontUrl: 'https://shop.knef.ng',
        campaignName: 'Spring Sale',
        promotionEndDate: '2026-12-31',
      };
      const template = Object.keys(vars).map((k) => `{${k}}`).join(' ');
      const result = service.interpolateTemplate({ template, variables: vars });

      expect(result.appliedVars).toHaveLength(7);
      expect(result.skippedVars).toHaveLength(0);
    });
  });

  // ── Security: AI output cannot change org or status ──────────────────────────

  describe('security — AI output cannot elevate status or change org', () => {
    it('generateDraftContent never writes status — generate is purely read-then-respond', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Some body', callToAction: null }),
      );

      await service.generateDraftContent(ORG_ID, USER_ID, DRAFT_ID, {});

      // Generate must never persist anything — applying is caller's responsibility via PATCH
      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('generateDraftContent never writes organizationId — no DB mutation on generate', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Content', callToAction: null }),
      );

      await service.generateDraftContent(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('generateVariant never writes status=PUBLISHED to content', async () => {
      mockAiCompletion.complete.mockResolvedValue(
        jsonResponse({ body: 'Content', callToAction: null }),
      );
      mockPrisma.contentVariant.findFirst.mockResolvedValue(null);
      mockPrisma.contentVariant.create.mockResolvedValue({
        id: 'v1', draftId: DRAFT_ID, platform: 'EMAIL', body: 'Content',
      });

      await service.generateVariant(ORG_ID, USER_ID, DRAFT_ID, {
        platform: 'EMAIL',
        saveToDraft: true,
      });

      const createData = (mockPrisma.contentVariant.create.mock.calls[0][0] as {
        data: Record<string, unknown>
      }).data;
      expect(createData).not.toHaveProperty('status');
    });

    it('generateVariant enforces org isolation — only accesses draft in calling org', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(null);

      await expect(
        service.generateVariant('org-evil', USER_ID, DRAFT_ID, { platform: 'EMAIL' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Shorten & expand ─────────────────────────────────────────────────────────

  describe('shortenContent', () => {
    it('preserves original while returning shortened suggestion', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ body: 'Short!' }));

      const result = await service.shortenContent(ORG_ID, USER_ID, DRAFT_ID);

      expect(result.originalBody).toBe(mockDraft.body);
      expect(result.suggestedBody).toBe('Short!');
    });

    it('throws when draft body is null', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ ...mockDraft, body: null });

      await expect(service.shortenContent(ORG_ID, USER_ID, DRAFT_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('expandContent', () => {
    it('returns expanded suggestion without auto-applying', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ body: 'Much longer expanded content here.' }));

      const result = await service.expandContent(ORG_ID, USER_ID, DRAFT_ID, {});

      expect(result.originalBody).toBe(mockDraft.body);
      expect(result.suggestedBody).toContain('expanded');
      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });
  });

  describe('changeTone', () => {
    it('returns tone-changed suggestion without auto-applying', async () => {
      mockAiCompletion.complete.mockResolvedValue(jsonResponse({ body: 'Formal version of content.' }));

      const result = await service.changeTone(ORG_ID, USER_ID, DRAFT_ID, { tone: 'formal' });

      expect(result.suggestedBody).toBe('Formal version of content.');
      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('throws when draft body is null', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ ...mockDraft, body: null });

      await expect(service.changeTone(ORG_ID, USER_ID, DRAFT_ID, { tone: 'casual' })).rejects.toThrow(BadRequestException);
    });
  });
});
