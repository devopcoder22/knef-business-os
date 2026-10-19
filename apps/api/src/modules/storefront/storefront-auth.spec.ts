import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StorefrontAuthService } from './storefront-auth.service';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { EmailService } from '../communications/email.service';

// ── Shared mocks ─────────────────────────────────────────────────────────────

const ORG_ID = 'org-test-001';

const mockAccount = {
  id: 'account-001',
  organizationId: ORG_ID,
  customerId: 'customer-001',
  email: 'test@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '+2348012345678',
  passwordHash: '$2b$12$FAKEHASH.abcdefghijklmnopqrstuvwxyz', // placeholder
  isVerified: false,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCustomer = {
  id: 'customer-001',
  organizationId: ORG_ID,
  code: 'WEB-001',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'test@example.com',
  phone: '+2348012345678',
  isActive: true,
};

const mockPrisma = {
  customerAccount: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  customer: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  customerAccountRefreshToken: {
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock.access.token'),
  verify: jest.fn(),
};

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('super-secret-jwt-key-that-is-long-enough'),
};

const mockRedis = {
  get: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
};

const mockEmail = { sendEmail: jest.fn().mockResolvedValue(undefined) };

// ── StorefrontAuthService ─────────────────────────────────────────────────────

describe('StorefrontAuthService', () => {
  let service: StorefrontAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedis },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<StorefrontAuthService>(StorefrontAuthService);
  });

  // ── register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a new customer account and returns token pair + customer info', async () => {
      mockPrisma.customerAccount.findFirst.mockResolvedValue(null);
      mockPrisma.customer.findFirst.mockResolvedValue(null);
      mockPrisma.customer.create.mockResolvedValue(mockCustomer);
      mockPrisma.customerAccount.create.mockResolvedValue(mockAccount);
      mockPrisma.customerAccountRefreshToken.create.mockResolvedValue({});

      const result = await service.register(ORG_ID, {
        email: 'test@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+2348012345678',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.customer).toMatchObject({
        id: mockAccount.id,
        email: mockAccount.email,
        firstName: mockAccount.firstName,
        lastName: mockAccount.lastName,
      });
      expect(mockPrisma.customerAccount.create).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when email is already registered', async () => {
      mockPrisma.customerAccount.findFirst.mockResolvedValue(mockAccount);

      await expect(
        service.register(ORG_ID, {
          email: 'test@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.customerAccount.create).not.toHaveBeenCalled();
    });

    it('links to existing CRM customer found by phone', async () => {
      mockPrisma.customerAccount.findFirst.mockResolvedValue(null);
      mockPrisma.customer.findFirst.mockResolvedValueOnce(mockCustomer); // found by phone
      mockPrisma.customerAccount.create.mockResolvedValue(mockAccount);
      mockPrisma.customerAccountRefreshToken.create.mockResolvedValue({});

      await service.register(ORG_ID, {
        email: 'test@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+2348012345678',
        password: 'password123',
      });

      // Should NOT create a new customer since one was found
      expect(mockPrisma.customer.create).not.toHaveBeenCalled();
      expect(mockPrisma.customerAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: mockCustomer.id }),
        }),
      );
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns token pair on successful login', async () => {
      // Use a real bcrypt hash for 'password123'
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash('password123', 1); // low rounds for test speed

      mockPrisma.customerAccount.findFirst.mockResolvedValue({
        ...mockAccount,
        passwordHash,
      });
      mockRedis.get.mockResolvedValue(null); // no lockout
      mockPrisma.customerAccount.update.mockResolvedValue({});
      mockPrisma.customerAccountRefreshToken.create.mockResolvedValue({});

      const result = await service.login(ORG_ID, {
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.customer.email).toBe(mockAccount.email);
      expect(mockRedis.del).toHaveBeenCalledWith(`customer-lockout:${mockAccount.id}`);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash('correct-password', 1);

      mockPrisma.customerAccount.findFirst.mockResolvedValue({
        ...mockAccount,
        passwordHash,
      });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(undefined);

      await expect(
        service.login(ORG_ID, { email: 'test@example.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockRedis.incr).toHaveBeenCalledWith(`customer-lockout:${mockAccount.id}`);
    });

    it('throws UnauthorizedException when account does not exist', async () => {
      mockPrisma.customerAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.login(ORG_ID, { email: 'nobody@example.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when account is locked out', async () => {
      mockPrisma.customerAccount.findFirst.mockResolvedValue(mockAccount);
      mockRedis.get.mockResolvedValue('5'); // max attempts reached

      await expect(
        service.login(ORG_ID, { email: 'test@example.com', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── getProfile ────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns safe account fields without passwordHash', async () => {
      const safeAccount = {
        id: mockAccount.id,
        email: mockAccount.email,
        firstName: mockAccount.firstName,
        lastName: mockAccount.lastName,
        phone: mockAccount.phone,
        isVerified: mockAccount.isVerified,
        lastLoginAt: null,
        createdAt: mockAccount.createdAt,
      };
      mockPrisma.customerAccount.findUnique.mockResolvedValue(safeAccount);

      const result = await service.getProfile(mockAccount.id);

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe(mockAccount.email);
    });

    it('throws NotFoundException when account not found', async () => {
      mockPrisma.customerAccount.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});

// ── CustomerJwtGuard ─────────────────────────────────────────────────────────

describe('CustomerJwtGuard', () => {
  const { CustomerJwtGuard } = require('./guards/customer-jwt.guard');

  const mockJwtService = {
    verify: jest.fn(),
  };
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('jwt-secret-key-long-enough-to-pass-validation'),
  };
  const mockPrismaForGuard = {
    customerAccount: {
      findUnique: jest.fn(),
    },
  };

  let guard: InstanceType<typeof CustomerJwtGuard>;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new CustomerJwtGuard(
      mockJwtService as unknown as JwtService,
      mockConfigService as unknown as ConfigService,
      mockPrismaForGuard as unknown as PrismaService,
    );
  });

  function makeContext(authHeader?: string) {
    const request: Record<string, unknown> = {
      headers: authHeader ? { authorization: authHeader } : {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as import('@nestjs/common').ExecutionContext;
  }

  it('rejects requests with no Authorization header', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('rejects requests with non-Bearer Authorization header', async () => {
    await expect(guard.canActivate(makeContext('Basic abc123'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects staff tokens (type !== customer)', async () => {
    mockJwtService.verify.mockReturnValue({
      sub: 'user-001',
      orgId: ORG_ID,
      email: 'staff@example.com',
      type: 'staff', // wrong type
    });

    await expect(guard.canActivate(makeContext('Bearer valid.staff.token'))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(mockPrismaForGuard.customerAccount.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when customer account is not found', async () => {
    mockJwtService.verify.mockReturnValue({
      sub: 'account-missing',
      orgId: ORG_ID,
      email: 'test@example.com',
      type: 'customer',
    });
    mockPrismaForGuard.customerAccount.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext('Bearer valid.customer.token'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when customer account is inactive', async () => {
    mockJwtService.verify.mockReturnValue({
      sub: mockAccount.id,
      orgId: ORG_ID,
      email: mockAccount.email,
      type: 'customer',
    });
    mockPrismaForGuard.customerAccount.findUnique.mockResolvedValue({
      ...mockAccount,
      isActive: false,
    });

    await expect(guard.canActivate(makeContext('Bearer valid.customer.token'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('sets customerAccount on request and returns true for valid token', async () => {
    mockJwtService.verify.mockReturnValue({
      sub: mockAccount.id,
      orgId: ORG_ID,
      email: mockAccount.email,
      type: 'customer',
    });

    const activeAccount = {
      id: mockAccount.id,
      organizationId: ORG_ID,
      customerId: mockAccount.customerId,
      email: mockAccount.email,
      firstName: mockAccount.firstName,
      lastName: mockAccount.lastName,
      phone: mockAccount.phone,
      isVerified: false,
      isActive: true,
    };
    mockPrismaForGuard.customerAccount.findUnique.mockResolvedValue(activeAccount);

    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer valid.customer.token' },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as import('@nestjs/common').ExecutionContext;

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request['customerAccount']).toEqual(activeAccount);
  });
});

// ── StorefrontOrdersController — IDOR test ───────────────────────────────────

describe('StorefrontOrdersController — IDOR protection', () => {
  const { StorefrontOrdersController } = require('./storefront-orders.controller');

  const mockPrismaForOrders = {
    salesOrder: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  let controller: InstanceType<typeof StorefrontOrdersController>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new StorefrontOrdersController(mockPrismaForOrders as unknown as PrismaService);
  });

  const customerA: import('./guards/customer-jwt.guard').CustomerAccountContext = {
    id: 'account-A',
    organizationId: ORG_ID,
    customerId: 'customer-A',
    email: 'a@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    phone: null,
    isVerified: true,
    isActive: true,
  };

  it('throws NotFoundException when order belongs to a different customer (IDOR prevention)', async () => {
    // The DB query already enforces ownership via customerAccountId filter;
    // when ownership doesn't match, findFirst returns null
    mockPrismaForOrders.salesOrder.findFirst.mockResolvedValue(null);

    await expect(
      controller.getOrder(customerA, 'WEB-01012026-XXXX'),
    ).rejects.toThrow(NotFoundException);

    // Verify the query includes the customer's own accountId
    expect(mockPrismaForOrders.salesOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerAccountId: customerA.id }),
      }),
    );
  });

  it('returns order data when order belongs to the authenticated customer', async () => {
    const mockOrder = {
      reference: 'WEB-01012026-ABCD',
      status: 'CONFIRMED',
      currency: 'NGN',
      subtotal: { toString: () => '5000.00' },
      discountAmount: { toString: () => '0.00' },
      taxAmount: { toString: () => '0.00' },
      deliveryFee: { toString: () => '500.00' },
      totalAmount: { toString: () => '5500.00' },
      notes: null,
      deliveryAddress: '123 Test St',
      deliveryCity: 'Lagos',
      deliveryState: 'Lagos',
      deliveryPhone: '+2348000000001',
      createdAt: new Date(),
      completedAt: null,
      items: [],
    };
    mockPrismaForOrders.salesOrder.findFirst.mockResolvedValue(mockOrder);

    const result = await controller.getOrder(customerA, 'WEB-01012026-ABCD');

    expect(result.reference).toBe('WEB-01012026-ABCD');
    expect(result.status).toBe('Confirmed'); // mapped label
    expect(result.deliveryFee).toBe('500.00');
  });
});
