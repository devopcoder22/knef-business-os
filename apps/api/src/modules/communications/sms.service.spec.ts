import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SmsService } from './sms.service';
import { PrismaService } from '../../common/services/prisma.service';
import { QueueService } from '../../common/services/queue.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  smsProvider: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  communicationLog: {
    create: jest.fn(),
  },
};

const mockQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
const mockConfig = {
  get: jest.fn().mockReturnValue('a'.repeat(64)),
};

describe('SmsService', () => {
  let service: SmsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QueueService, useValue: mockQueue },
        { provide: AuditService, useValue: mockAudit },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(SmsService);
  });

  // ── listProviders ──────────────────────────────────────────────────────────

  describe('listProviders', () => {
    it('returns active providers ordered by isDefault', async () => {
      const providers = [{ id: '1', name: 'Termii', provider: 'termii', isDefault: true }];
      mockPrisma.smsProvider.findMany.mockResolvedValue(providers);

      const result = await service.listProviders('org-1');

      expect(mockPrisma.smsProvider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', isActive: true } }),
      );
      expect(result).toEqual(providers);
    });
  });

  // ── createProvider ─────────────────────────────────────────────────────────

  describe('createProvider', () => {
    it('creates a provider and logs audit', async () => {
      mockPrisma.smsProvider.findFirst.mockResolvedValue(null);
      mockPrisma.smsProvider.create.mockResolvedValue({
        id: 'prov-1',
        name: 'Termii',
        provider: 'termii',
        isDefault: true,
      });

      const result = await service.createProvider('org-1', 'user-1', {
        name: 'Termii',
        provider: 'termii',
        apiKey: 'test-api-key',
        isDefault: true,
      });

      expect(mockPrisma.smsProvider.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SMS_PROVIDER_CREATED' }),
      );
      expect(result.id).toBe('prov-1');
    });

    it('throws when provider already configured', async () => {
      mockPrisma.smsProvider.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createProvider('org-1', 'user-1', {
          name: 'Termii',
          provider: 'termii',
          apiKey: 'key',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── updateProvider ─────────────────────────────────────────────────────────

  describe('updateProvider', () => {
    it('throws NotFoundException for unknown provider', async () => {
      mockPrisma.smsProvider.findFirst.mockResolvedValue(null);

      await expect(
        service.updateProvider('org-1', 'user-1', 'bad-id', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── deleteProvider ─────────────────────────────────────────────────────────

  describe('deleteProvider', () => {
    it('throws NotFoundException for unknown provider', async () => {
      mockPrisma.smsProvider.findFirst.mockResolvedValue(null);

      await expect(service.deleteProvider('org-1', 'user-1', 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes existing provider', async () => {
      mockPrisma.smsProvider.findFirst.mockResolvedValue({ id: 'prov-1' });
      mockPrisma.smsProvider.delete.mockResolvedValue({});

      const result = await service.deleteProvider('org-1', 'user-1', 'prov-1');

      expect(mockPrisma.smsProvider.delete).toHaveBeenCalledWith({ where: { id: 'prov-1' } });
      expect(result.message).toContain('deleted');
    });
  });

  // ── queueSms ──────────────────────────────────────────────────────────────

  describe('queueSms', () => {
    it('creates a communication log and enqueues a job', async () => {
      mockPrisma.communicationLog.create.mockResolvedValue({ id: 'log-1' });

      const result = await service.queueSms({
        organizationId: 'org-1',
        to: '08012345678',
        message: 'Hello!',
        messageType: 'TRANSACTIONAL',
      });

      expect(mockPrisma.communicationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ channel: 'SMS', status: 'queued' }),
        }),
      );
      expect(mockQueue.enqueue).toHaveBeenCalled();
      expect(result.logId).toBe('log-1');
    });
  });
});
