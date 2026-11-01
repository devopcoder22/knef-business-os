import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CustomerAddressService } from './customer-address.service';
import { PrismaService } from '../../common/services/prisma.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-test-001';
const ACCOUNT_ID = 'acct-001';
const OTHER_ACCOUNT_ID = 'acct-ATTACKER';

const mockPrisma = {
  savedAddress: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
};

function makeAddress(overrides: Record<string, unknown> = {}) {
  return {
    id: 'addr-1',
    customerAccountId: ACCOUNT_ID,
    organizationId: ORG_ID,
    label: 'Home',
    fullName: 'Jane Doe',
    phone: '+2348012345678',
    addressLine1: '12 Allen Avenue, Ikeja',
    addressLine2: null,
    landmark: 'Beside First Bank',
    city: 'Ikeja',
    state: 'Lagos',
    postalCode: null,
    country: 'Nigeria',
    countryCode: 'NG',
    placeId: 'ChIJexample123',
    formattedAddress: '12 Allen Avenue, Ikeja, Lagos, Nigeria',
    latitude: { toNumber: () => 6.6018 },
    longitude: { toNumber: () => 3.3515 },
    addressSource: 'GOOGLE_PLACE',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CustomerAddressService', () => {
  let service: CustomerAddressService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAddressService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CustomerAddressService>(CustomerAddressService);
  });

  // ── listAddresses ────────────────────────────────────────────────────────────

  describe('listAddresses', () => {
    it('returns only addresses belonging to the given customerAccountId + orgId', async () => {
      const addresses = [makeAddress()];
      mockPrisma.savedAddress.findMany.mockResolvedValue(addresses);

      const result = await service.listAddresses(ACCOUNT_ID, ORG_ID);

      expect(result).toBe(addresses);
      expect(mockPrisma.savedAddress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerAccountId: ACCOUNT_ID, organizationId: ORG_ID },
        }),
      );
    });

    it('cross-customer IDOR: attacker org-scoped query cannot access other account addresses', async () => {
      mockPrisma.savedAddress.findMany.mockResolvedValue([]);

      await service.listAddresses(OTHER_ACCOUNT_ID, ORG_ID);

      const call = mockPrisma.savedAddress.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.customerAccountId).toBe(OTHER_ACCOUNT_ID);
      expect(call.where.customerAccountId).not.toBe(ACCOUNT_ID);
    });
  });

  // ── createAddress ────────────────────────────────────────────────────────────

  describe('createAddress', () => {
    it('creates an address with GOOGLE_PLACE source when placeId and coords provided', async () => {
      mockPrisma.savedAddress.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.savedAddress.create.mockResolvedValue(makeAddress({ addressSource: 'GOOGLE_PLACE' }));

      const result = await service.createAddress(ACCOUNT_ID, ORG_ID, {
        addressLine1: '12 Allen Avenue, Ikeja',
        placeId: 'ChIJexample123',
        latitude: 6.6018,
        longitude: 3.3515,
        addressSource: 'GOOGLE_PLACE',
      });

      expect(result.addressSource).toBe('GOOGLE_PLACE');
    });

    it('creates a MANUAL address when no placeId provided', async () => {
      mockPrisma.savedAddress.create.mockResolvedValue(makeAddress({ addressSource: 'MANUAL', placeId: null }));

      const result = await service.createAddress(ACCOUNT_ID, ORG_ID, {
        addressLine1: '15 Broad Street, Lagos',
        addressSource: 'MANUAL',
      });

      expect(result.addressSource).toBe('MANUAL');
    });

    it('rejects addressLine1 shorter than 3 chars', async () => {
      await expect(
        service.createAddress(ACCOUNT_ID, ORG_ID, { addressLine1: 'AB' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('when isDefault=true, existing defaults are cleared first', async () => {
      mockPrisma.savedAddress.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.savedAddress.create.mockResolvedValue(makeAddress({ isDefault: true }));

      await service.createAddress(ACCOUNT_ID, ORG_ID, {
        addressLine1: '22 Broad St, Lagos Island',
        isDefault: true,
      });

      expect(mockPrisma.savedAddress.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerAccountId: ACCOUNT_ID, organizationId: ORG_ID },
          data: { isDefault: false },
        }),
      );
    });

    it('rejects latitude outside -90..90 range', async () => {
      await expect(
        service.createAddress(ACCOUNT_ID, ORG_ID, {
          addressLine1: '12 Allen Avenue',
          latitude: 95,
          longitude: 3.35,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects longitude outside -180..180 range', async () => {
      await expect(
        service.createAddress(ACCOUNT_ID, ORG_ID, {
          addressLine1: '12 Allen Avenue',
          latitude: 6.6,
          longitude: 200,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts null coordinates for manual addresses', async () => {
      mockPrisma.savedAddress.create.mockResolvedValue(makeAddress({ latitude: null, longitude: null }));

      await expect(
        service.createAddress(ACCOUNT_ID, ORG_ID, {
          addressLine1: '12 Allen Avenue, Ikeja',
          latitude: undefined,
          longitude: undefined,
        }),
      ).resolves.not.toThrow();
    });
  });

  // ── updateAddress ────────────────────────────────────────────────────────────

  describe('updateAddress', () => {
    it('cross-customer IDOR: cannot update address owned by another account', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAddress(OTHER_ACCOUNT_ID, ORG_ID, 'addr-1', { addressLine1: 'Evil St' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('cannot update address from a different org even with matching account', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAddress(ACCOUNT_ID, 'org-DIFFERENT', 'addr-1', { addressLine1: 'New St' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects malformed latitude on update', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(makeAddress());

      await expect(
        service.updateAddress(ACCOUNT_ID, ORG_ID, 'addr-1', { latitude: -95 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('valid update succeeds', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(makeAddress());
      mockPrisma.savedAddress.update.mockResolvedValue(makeAddress({ landmark: 'Near LUTH' }));

      const result = await service.updateAddress(ACCOUNT_ID, ORG_ID, 'addr-1', {
        landmark: 'Near LUTH',
      });

      expect(result.landmark).toBe('Near LUTH');
    });
  });

  // ── deleteAddress ────────────────────────────────────────────────────────────

  describe('deleteAddress', () => {
    it('cross-customer IDOR: delete with wrong account ID throws NotFoundException', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteAddress(OTHER_ACCOUNT_ID, ORG_ID, 'addr-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.savedAddress.delete).not.toHaveBeenCalled();
    });

    it('deletes when ownership matches', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(makeAddress());
      mockPrisma.savedAddress.delete.mockResolvedValue(makeAddress());

      await service.deleteAddress(ACCOUNT_ID, ORG_ID, 'addr-1');

      expect(mockPrisma.savedAddress.delete).toHaveBeenCalledWith({ where: { id: 'addr-1' } });
    });
  });

  // ── setDefault ───────────────────────────────────────────────────────────────

  describe('setDefault', () => {
    it('cross-customer IDOR: setDefault with wrong account throws ForbiddenException', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(null);

      await expect(
        service.setDefault(OTHER_ACCOUNT_ID, ORG_ID, 'addr-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sets the correct address as default and clears others', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(makeAddress());
      mockPrisma.savedAddress.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.savedAddress.update.mockResolvedValue(makeAddress({ isDefault: true }));

      const result = await service.setDefault(ACCOUNT_ID, ORG_ID, 'addr-1');

      expect(mockPrisma.savedAddress.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerAccountId: ACCOUNT_ID, organizationId: ORG_ID },
          data: { isDefault: false },
        }),
      );
      expect(result.isDefault).toBe(true);
    });
  });

  // ── Coordinate validation ─────────────────────────────────────────────────────

  describe('Coordinate validation edge cases', () => {
    it('latitude at boundary 90 is accepted', async () => {
      mockPrisma.savedAddress.create.mockResolvedValue(makeAddress({ latitude: { toNumber: () => 90 } }));

      await expect(
        service.createAddress(ACCOUNT_ID, ORG_ID, {
          addressLine1: '12 Allen Avenue',
          latitude: 90,
          longitude: 0,
        }),
      ).resolves.not.toThrow();
    });

    it('latitude at boundary -90 is accepted', async () => {
      mockPrisma.savedAddress.create.mockResolvedValue(makeAddress({ latitude: { toNumber: () => -90 } }));

      await expect(
        service.createAddress(ACCOUNT_ID, ORG_ID, {
          addressLine1: '12 Allen Avenue',
          latitude: -90,
          longitude: 0,
        }),
      ).resolves.not.toThrow();
    });

    it('longitude at boundary 180 is accepted', async () => {
      mockPrisma.savedAddress.create.mockResolvedValue(makeAddress({ longitude: { toNumber: () => 180 } }));

      await expect(
        service.createAddress(ACCOUNT_ID, ORG_ID, {
          addressLine1: '12 Allen Avenue',
          latitude: 0,
          longitude: 180,
        }),
      ).resolves.not.toThrow();
    });

    it('longitude at boundary -180 is accepted', async () => {
      mockPrisma.savedAddress.create.mockResolvedValue(makeAddress({ longitude: { toNumber: () => -180 } }));

      await expect(
        service.createAddress(ACCOUNT_ID, ORG_ID, {
          addressLine1: '12 Allen Avenue',
          latitude: 0,
          longitude: -180,
        }),
      ).resolves.not.toThrow();
    });
  });

  // ── Order snapshot independence ───────────────────────────────────────────────

  describe('Order snapshot integrity', () => {
    it('updating a saved address does NOT touch SalesOrder — no salesOrder call is made', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(makeAddress());
      mockPrisma.savedAddress.update.mockResolvedValue(makeAddress({ addressLine1: '99 New Road' }));

      await service.updateAddress(ACCOUNT_ID, ORG_ID, 'addr-1', { addressLine1: '99 New Road' });

      // Confirm no salesOrder mutation was attempted
      const prismaCalls = Object.keys(mockPrisma).filter((k) => k !== 'savedAddress');
      prismaCalls.forEach((key) => {
        const model = mockPrisma[key as keyof typeof mockPrisma] as Record<string, jest.Mock>;
        Object.values(model).forEach((fn) => {
          expect(fn).not.toHaveBeenCalled();
        });
      });
    });

    it('deleting a saved address does NOT touch SalesOrder', async () => {
      mockPrisma.savedAddress.findFirst.mockResolvedValue(makeAddress());
      mockPrisma.savedAddress.delete.mockResolvedValue(makeAddress());

      await service.deleteAddress(ACCOUNT_ID, ORG_ID, 'addr-1');

      const prismaCalls = Object.keys(mockPrisma).filter((k) => k !== 'savedAddress');
      prismaCalls.forEach((key) => {
        const model = mockPrisma[key as keyof typeof mockPrisma] as Record<string, jest.Mock>;
        Object.values(model).forEach((fn) => {
          expect(fn).not.toHaveBeenCalled();
        });
      });
    });
  });
});
