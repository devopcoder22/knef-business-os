import { Test, TestingModule } from '@nestjs/testing';
import { ChannelPreferenceService } from './channel-preference.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  channelPreference: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('ChannelPreferenceService', () => {
  let service: ChannelPreferenceService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelPreferenceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(ChannelPreferenceService);
  });

  // ── getPreferences ─────────────────────────────────────────────────────────

  describe('getPreferences', () => {
    it('returns preferences for a user', async () => {
      const prefs = [{ id: '1', channel: 'EMAIL', messageType: 'MARKETING', status: 'subscribed' }];
      mockPrisma.channelPreference.findMany.mockResolvedValue(prefs);

      const result = await service.getPreferences('org-1', 'user-1');

      expect(mockPrisma.channelPreference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', userId: 'user-1' } }),
      );
      expect(result).toEqual(prefs);
    });
  });

  // ── upsertPreference ───────────────────────────────────────────────────────

  describe('upsertPreference', () => {
    it('creates a new preference when none exists', async () => {
      mockPrisma.channelPreference.findFirst.mockResolvedValue(null);
      mockPrisma.channelPreference.create.mockResolvedValue({});

      await service.upsertPreference(
        'org-1',
        { userId: 'user-1', channel: 'SMS', messageType: 'MARKETING', status: 'subscribed' },
        'user-1',
      );

      expect(mockPrisma.channelPreference.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ channel: 'SMS', status: 'subscribed' }),
        }),
      );
    });

    it('updates existing preference', async () => {
      const existing = { id: 'pref-1', status: 'subscribed', source: 'web', consentAt: null };
      mockPrisma.channelPreference.findFirst.mockResolvedValue(existing);
      mockPrisma.channelPreference.update.mockResolvedValue({});

      await service.upsertPreference(
        'org-1',
        { userId: 'user-1', channel: 'EMAIL', messageType: 'MARKETING', status: 'unsubscribed' },
        'user-1',
      );

      expect(mockPrisma.channelPreference.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'unsubscribed', unsubscribedAt: expect.any(Date) }),
        }),
      );
    });

    it('does nothing when no userId or email provided', async () => {
      await service.upsertPreference(
        'org-1',
        { channel: 'SMS', messageType: 'MARKETING', status: 'subscribed' },
      );
      expect(mockPrisma.channelPreference.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── checkConsent ───────────────────────────────────────────────────────────

  describe('checkConsent', () => {
    it('allows TRANSACTIONAL messages regardless of marketing opt-out', async () => {
      // Not suppressed
      mockPrisma.channelPreference.findFirst.mockResolvedValue(null);

      const result = await service.checkConsent('org-1', { userId: 'user-1' }, 'SMS', 'TRANSACTIONAL');

      expect(result.allowed).toBe(true);
    });

    it('blocks TRANSACTIONAL messages if user is suppressed', async () => {
      mockPrisma.channelPreference.findFirst.mockResolvedValue({
        id: 'pref-1',
        status: 'suppressed',
      });

      const result = await service.checkConsent('org-1', { userId: 'user-1' }, 'SMS', 'TRANSACTIONAL');

      expect(result.allowed).toBe(false);
    });

    it('allows MARKETING when no preference exists (default allow)', async () => {
      mockPrisma.channelPreference.findMany.mockResolvedValue([]);

      const result = await service.checkConsent('org-1', { email: 'test@example.com' }, 'EMAIL', 'MARKETING');

      expect(result.allowed).toBe(true);
    });

    it('blocks MARKETING when user is unsubscribed', async () => {
      mockPrisma.channelPreference.findMany.mockResolvedValue([
        { id: '1', messageType: 'MARKETING', status: 'unsubscribed' },
      ]);

      const result = await service.checkConsent('org-1', { email: 'test@example.com' }, 'EMAIL', 'MARKETING');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Unsubscribed');
    });

    it('blocks MARKETING when user is suppressed', async () => {
      mockPrisma.channelPreference.findMany.mockResolvedValue([
        { id: '1', messageType: 'ALL', status: 'suppressed' },
      ]);

      const result = await service.checkConsent('org-1', { email: 'test@example.com' }, 'EMAIL', 'MARKETING');

      expect(result.allowed).toBe(false);
    });

    it('allows MARKETING when user is subscribed', async () => {
      mockPrisma.channelPreference.findMany.mockResolvedValue([
        { id: '1', messageType: 'MARKETING', status: 'subscribed' },
      ]);

      const result = await service.checkConsent('org-1', { email: 'test@example.com' }, 'EMAIL', 'MARKETING');

      expect(result.allowed).toBe(true);
    });
  });

  // ── suppress ──────────────────────────────────────────────────────────────

  describe('suppress', () => {
    it('marks all channel preferences as suppressed', async () => {
      const prefs = [{ id: 'pref-1', metadata: null }, { id: 'pref-2', metadata: null }];
      mockPrisma.channelPreference.findMany.mockResolvedValue(prefs);
      mockPrisma.channelPreference.update.mockResolvedValue({});

      await service.suppress('org-1', { email: 'bad@example.com' }, 'EMAIL', 'hard_bounce');

      expect(mockPrisma.channelPreference.update).toHaveBeenCalledTimes(2);
    });

    it('creates suppressed records when none exist', async () => {
      mockPrisma.channelPreference.findMany.mockResolvedValue([]);
      mockPrisma.channelPreference.create.mockResolvedValue({});

      await service.suppress('org-1', { email: 'new@example.com' }, 'SMS', 'spam_complaint');

      expect(mockPrisma.channelPreference.create).toHaveBeenCalled();
    });
  });
});
