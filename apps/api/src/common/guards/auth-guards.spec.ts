/**
 * Stage 20 Remediation — Auth Guard Unit Tests
 *
 * Coverage:
 *  1.  JwtAuthGuard: IS_PUBLIC_KEY=true → returns true without calling super.canActivate
 *  2.  JwtAuthGuard: no public metadata → delegates to super (jwt strategy)
 *  3.  JwtAuthGuard.handleRequest: no user → UnauthorizedException
 *  4.  JwtAuthGuard.handleRequest: err present → re-throws
 *  5.  PermissionGuard: no metadata → allows (returns true)
 *  6.  PermissionGuard: user has required permission → allows
 *  7.  PermissionGuard: user lacks permission → ForbiddenException
 *  8.  PermissionGuard: no user in request → ForbiddenException
 *  9.  ApiKeyGuard: missing header → UnauthorizedException
 *  10. ApiKeyGuard: invalid key (hash not found) → UnauthorizedException
 *  11. ApiKeyGuard: revoked key → UnauthorizedException + audit log
 *  12. ApiKeyGuard: expired key → UnauthorizedException + audit log
 *  13. ApiKeyGuard: valid key → returns true, sets request.apiKey
 *  14. ApiKeyScopeGuard: no scope metadata → allows
 *  15. ApiKeyScopeGuard: apiKey has required scope → allows
 *  16. ApiKeyScopeGuard: apiKey missing scope → ForbiddenException + audit log
 *  17. ApiKeyScopeGuard: no apiKey on request → ForbiddenException
 */

import { UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionGuard } from './permission.guard';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyScopeGuard } from './api-key-scope.guard';
import { API_SCOPE_KEY } from '../decorators/require-api-scope.decorator';
import { createHash } from 'crypto';

const ORG = 'org-1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReflector(metadataMap: Record<string, unknown> = {}) {
  return {
    getAllAndOverride: jest.fn((key: string) => metadataMap[key]),
  } as unknown as Reflector;
}

function makeContext(overrides: {
  user?: unknown;
  apiKey?: unknown;
  headers?: Record<string, string>;
} = {}): ExecutionContext {
  const request: Record<string, unknown> = {};
  if (overrides.user !== undefined) request['user'] = overrides.user;
  if (overrides.apiKey !== undefined) request['apiKey'] = overrides.apiKey;
  if (overrides.headers) request['headers'] = overrides.headers;
  else request['headers'] = {};

  return {
    getHandler: () => ({}),
    getClass: () => ({ name: 'TestController' }),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function makeAudit() {
  return { log: jest.fn(async () => undefined) };
}

// ── JwtAuthGuard ──────────────────────────────────────────────────────────────

describe('JwtAuthGuard', () => {
  it('1: IS_PUBLIC_KEY=true → returns true without calling super', () => {
    const reflector = makeReflector({ [IS_PUBLIC_KEY]: true });
    const guard = new JwtAuthGuard(reflector);
    // Spy on super.canActivate — if called it would attempt JWT validation
    const superActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate').mockReturnValue(true);

    const context = makeContext();
    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(superActivate).not.toHaveBeenCalled();
    superActivate.mockRestore();
  });

  it('2: no public metadata → delegates to super.canActivate', () => {
    const reflector = makeReflector({ [IS_PUBLIC_KEY]: undefined });
    const guard = new JwtAuthGuard(reflector);
    const superActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate').mockReturnValue(true);

    const context = makeContext();
    guard.canActivate(context);

    expect(superActivate).toHaveBeenCalledWith(context);
    superActivate.mockRestore();
  });

  it('3: handleRequest with no user → throws UnauthorizedException', () => {
    const guard = new JwtAuthGuard(makeReflector());
    expect(() => guard.handleRequest(null, null)).toThrow(UnauthorizedException);
  });

  it('4: handleRequest with error → re-throws error', () => {
    const guard = new JwtAuthGuard(makeReflector());
    const err = new UnauthorizedException('JWT expired');
    expect(() => guard.handleRequest(err, null)).toThrow(err);
  });
});

// ── PermissionGuard ───────────────────────────────────────────────────────────

describe('PermissionGuard', () => {
  it('5: no permissions metadata → allows', () => {
    const reflector = makeReflector({ [PERMISSIONS_KEY]: undefined });
    const guard = new PermissionGuard(reflector);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('6: user has required permissions → allows', () => {
    const reflector = makeReflector({ [PERMISSIONS_KEY]: ['finance:view'] });
    const guard = new PermissionGuard(reflector);
    const context = makeContext({ user: { permissions: ['finance:view', 'sales:view'] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('7: user lacks required permission → ForbiddenException', () => {
    const reflector = makeReflector({ [PERMISSIONS_KEY]: ['finance:manage'] });
    const guard = new PermissionGuard(reflector);
    const context = makeContext({ user: { permissions: ['finance:view'] } });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('8: no user on request → ForbiddenException', () => {
    const reflector = makeReflector({ [PERMISSIONS_KEY]: ['finance:view'] });
    const guard = new PermissionGuard(reflector);
    const context = makeContext({ user: undefined });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

// ── ApiKeyGuard ───────────────────────────────────────────────────────────────

describe('ApiKeyGuard', () => {
  const RAW_KEY = 'test-api-key-value';
  const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex');

  it('9: missing x-api-key header → UnauthorizedException', async () => {
    const prisma = { aPIKey: { findFirst: jest.fn(), update: jest.fn() } };
    const guard = new ApiKeyGuard(prisma as never, makeAudit() as never);
    const context = makeContext({ headers: {} });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('10: key not found in DB → UnauthorizedException', async () => {
    const prisma = { aPIKey: { findFirst: jest.fn(async () => null), update: jest.fn() } };
    const guard = new ApiKeyGuard(prisma as never, makeAudit() as never);
    const context = makeContext({ headers: { 'x-api-key': RAW_KEY } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(prisma.aPIKey.findFirst).toHaveBeenCalledWith({ where: { keyHash: KEY_HASH } });
  });

  it('11: revoked key → UnauthorizedException + audit log', async () => {
    const revokedKey = { id: 'key-1', organizationId: ORG, name: 'test', isActive: false, expiresAt: null, scopes: [] };
    const audit = makeAudit();
    const prisma = { aPIKey: { findFirst: jest.fn(async () => revokedKey), update: jest.fn() } };
    const guard = new ApiKeyGuard(prisma as never, audit as never);
    const context = makeContext({ headers: { 'x-api-key': RAW_KEY } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    // Audit fires — but it's fire-and-forget (.catch), so just check the call was made
    await new Promise((r) => setTimeout(r, 10));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'API_KEY_AUTH_DENIED', metadata: expect.objectContaining({ reason: 'revoked' }) }));
  });

  it('12: expired key → UnauthorizedException + audit log', async () => {
    const expiredKey = {
      id: 'key-2',
      organizationId: ORG,
      name: 'test',
      isActive: true,
      expiresAt: new Date('2020-01-01'),
      scopes: [],
    };
    const audit = makeAudit();
    const prisma = { aPIKey: { findFirst: jest.fn(async () => expiredKey), update: jest.fn() } };
    const guard = new ApiKeyGuard(prisma as never, audit as never);
    const context = makeContext({ headers: { 'x-api-key': RAW_KEY } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await new Promise((r) => setTimeout(r, 10));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'API_KEY_AUTH_DENIED', metadata: expect.objectContaining({ reason: 'expired' }) }));
  });

  it('13: valid active key → returns true, sets request.apiKey', async () => {
    const validKey = { id: 'key-3', organizationId: ORG, name: 'test', isActive: true, expiresAt: null, scopes: ['sales:read'] };
    const prisma = {
      aPIKey: {
        findFirst: jest.fn(async () => validKey),
        update: jest.fn(async () => ({})),
      },
    };
    const guard = new ApiKeyGuard(prisma as never, makeAudit() as never);
    const context = makeContext({ headers: { 'x-api-key': RAW_KEY } });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req['apiKey']).toEqual(validKey);
    expect(req['organizationId']).toBe(ORG);
  });
});

// ── ApiKeyScopeGuard ──────────────────────────────────────────────────────────

describe('ApiKeyScopeGuard', () => {
  const SCOPE_ORG = 'org-scope-1';

  it('14: no scope metadata → allows (backward compat)', async () => {
    const reflector = makeReflector({ [API_SCOPE_KEY]: undefined });
    const guard = new ApiKeyScopeGuard(reflector, makeAudit() as never);
    const context = makeContext();
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('15: apiKey has required scope → allows', async () => {
    const reflector = makeReflector({ [API_SCOPE_KEY]: ['sales:read'] });
    const apiKey = { id: 'key-1', organizationId: SCOPE_ORG, name: 'test', scopes: ['sales:read', 'finance:view'] };
    const guard = new ApiKeyScopeGuard(reflector, makeAudit() as never);
    const context = makeContext({ apiKey });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('16: apiKey missing required scope → ForbiddenException + audit log', async () => {
    const reflector = makeReflector({ [API_SCOPE_KEY]: ['finance:manage'] });
    const apiKey = { id: 'key-2', organizationId: SCOPE_ORG, name: 'limited', scopes: ['sales:read'] };
    const audit = makeAudit();
    const guard = new ApiKeyScopeGuard(reflector, audit as never);
    const context = makeContext({ apiKey });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'API_KEY_SCOPE_DENIED',
      metadata: expect.objectContaining({ missingScopes: ['finance:manage'] }),
    }));
  });

  it('17: no apiKey on request (ApiKeyGuard not run) → ForbiddenException', async () => {
    const reflector = makeReflector({ [API_SCOPE_KEY]: ['sales:read'] });
    const guard = new ApiKeyScopeGuard(reflector, makeAudit() as never);
    const context = makeContext({ apiKey: undefined });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
