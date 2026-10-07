import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScopeGuard } from './api-key-scope.guard';
import { ApiKeyGuard } from './api-key.guard';
import { API_SCOPE_KEY } from '../decorators/require-api-scope.decorator';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApiKey(overrides: Partial<{ id: string; organizationId: string; name: string; scopes: string[]; isActive: boolean; expiresAt: Date | null }> = {}) {
  return {
    id: 'key-1',
    organizationId: 'org-1',
    name: 'Test Key',
    scopes: [] as string[],
    isActive: true,
    expiresAt: null,
    ...overrides,
  };
}

function buildContext(
  requiredScopes: string[] | undefined,
  apiKey: ReturnType<typeof buildApiKey> | undefined,
): ExecutionContext {
  const mockHandler = jest.fn();
  const mockClass = class {};
  return {
    getHandler: () => mockHandler,
    getClass: () => mockClass,
    switchToHttp: () => ({
      getRequest: () => ({
        apiKey,
        organizationId: apiKey?.organizationId,
      }),
    }),
    // Reflector.getAllAndOverride uses these — wired through the reflector mock below
  } as unknown as ExecutionContext;
}

// ── ApiKeyScopeGuard ──────────────────────────────────────────────────────────

describe('ApiKeyScopeGuard', () => {
  let guard: ApiKeyScopeGuard;
  let reflector: jest.Mocked<Reflector>;
  let audit: { log: jest.Mock };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    guard = new ApiKeyScopeGuard(reflector, audit as never);
  });

  // ── Test 1: valid API key + required scope → succeeds ─────────────────────

  it('1. valid API key + required scope → allows request', async () => {
    const apiKey = buildApiKey({ scopes: ['products:read'] });
    const ctx = buildContext(['products:read'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['products:read']);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Test 2: valid API key without required scope → rejected ───────────────

  it('2. valid API key without required scope → ForbiddenException', async () => {
    const apiKey = buildApiKey({ scopes: ['products:read'] });
    const ctx = buildContext(['products:write'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['products:write']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── Test 3: products:read cannot call product write endpoint ──────────────

  it('3. products:read key cannot call products:write endpoint', async () => {
    const apiKey = buildApiKey({ scopes: ['products:read'] });
    const ctx = buildContext(['products:write'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['products:write']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── Test 4: inventory:read cannot modify inventory ────────────────────────

  it('4. inventory:read key cannot call inventory:write endpoint', async () => {
    const apiKey = buildApiKey({ scopes: ['inventory:read'] });
    const ctx = buildContext(['inventory:write'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['inventory:write']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── Test 5: ai:read cannot execute AI tools ───────────────────────────────

  it('5. ai:read key cannot call ai:execute endpoint', async () => {
    const apiKey = buildApiKey({ scopes: ['ai:read'] });
    const ctx = buildContext(['ai:execute'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['ai:execute']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── Test 6: ai:execute allows authorized AI execution ────────────────────

  it('6. ai:execute key + ai:read on ai:execute endpoint → allowed', async () => {
    const apiKey = buildApiKey({ scopes: ['ai:read', 'ai:execute'] });
    const ctx = buildContext(['ai:execute'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['ai:execute']);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Test 7: finance:read cannot perform finance write operations ──────────

  it('7. finance:read key cannot call finance:write endpoint', async () => {
    const apiKey = buildApiKey({ scopes: ['finance:read'] });
    const ctx = buildContext(['finance:write'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['finance:write']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── Test 12 (partial): org isolation via key's organizationId ────────────

  it('12. scope guard uses organizationId from the authenticated key, not request body', async () => {
    const apiKey = buildApiKey({ organizationId: 'org-1', scopes: ['products:read'] });
    const ctx = buildContext(['products:read'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['products:read']);

    // Even if someone crafts a request with a different org in body, the
    // organizationId on the apiKey record is what the guard uses for audit
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // Audit NOT called on success
    expect(audit.log).not.toHaveBeenCalled();
  });

  // ── Test 14: API request parameters cannot override scope checks ──────────

  it('14. extra request fields cannot override scope enforcement', async () => {
    // Even if request has a "grantedScopes" field injected, the guard reads from apiKey record
    const apiKey = buildApiKey({ scopes: ['products:read'] });
    const ctx = {
      getHandler: () => jest.fn(),
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({
          apiKey,
          organizationId: 'org-1',
          grantedScopes: ['products:write', 'finance:write'],  // attacker-injected field
          body: { requiredScopes: [] },
        }),
      }),
    } as unknown as ExecutionContext;
    reflector.getAllAndOverride.mockReturnValue(['products:write']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── Test 15: denied request never reaches protected business logic ─────────

  it('15. denied scope → ForbiddenException thrown before handler executes', async () => {
    const handlerFn = jest.fn();
    const apiKey = buildApiKey({ scopes: ['products:read'] });
    const ctx = {
      getHandler: () => handlerFn,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ apiKey, organizationId: 'org-1' }),
      }),
    } as unknown as ExecutionContext;
    reflector.getAllAndOverride.mockReturnValue(['products:write']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    // Handler never called by the guard itself
    expect(handlerFn).not.toHaveBeenCalled();
  });

  // ── Test 19: AI routes enforce appropriate scopes ────────────────────────

  it('19. ai:read key cannot call ai:execute endpoint (AI scope enforcement)', async () => {
    const apiKey = buildApiKey({ scopes: ['ai:read', 'inventory:read', 'reports:read'] });
    const ctx = buildContext(['ai:execute'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['ai:execute']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('19. external agent with ai:execute scope → allowed on ai:execute endpoint', async () => {
    const apiKey = buildApiKey({ scopes: ['ai:read', 'inventory:read', 'reports:read', 'ai:execute'] });
    const ctx = buildContext(['ai:execute'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['ai:execute']);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Test 20: backward compat — no scope metadata → passes ────────────────

  it('20. route with no @RequireApiScope → passes (backward compat)', async () => {
    const apiKey = buildApiKey({ scopes: [] });
    const ctx = buildContext(undefined, apiKey);
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('20. route with empty scope array → passes (backward compat)', async () => {
    const apiKey = buildApiKey({ scopes: [] });
    const ctx = buildContext([], apiKey);
    reflector.getAllAndOverride.mockReturnValue([]);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Audit logging ─────────────────────────────────────────────────────────

  it('audit log recorded on scope denial with correct metadata', async () => {
    const apiKey = buildApiKey({ id: 'key-abc', organizationId: 'org-xyz', scopes: ['products:read'] });
    const ctx = buildContext(['finance:write'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['finance:write']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-xyz',
        action: 'API_KEY_SCOPE_DENIED',
        entity: 'ApiKey',
        entityId: 'key-abc',
        metadata: expect.objectContaining({
          requiredScopes: ['finance:write'],
          grantedScopes: ['products:read'],
          missingScopes: ['finance:write'],
        }),
      }),
    );
  });

  it('audit log NOT called on successful scope check', async () => {
    const apiKey = buildApiKey({ scopes: ['products:read', 'inventory:read'] });
    const ctx = buildContext(['products:read'], apiKey);
    reflector.getAllAndOverride.mockReturnValue(['products:read']);

    await guard.canActivate(ctx);
    expect(audit.log).not.toHaveBeenCalled();
  });

  // ── Missing API key context ───────────────────────────────────────────────

  it('ForbiddenException when apiKey not attached to request (guard order error)', async () => {
    const ctx = {
      getHandler: () => jest.fn(),
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ apiKey: undefined }) }),
    } as unknown as ExecutionContext;
    reflector.getAllAndOverride.mockReturnValue(['products:read']);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});

// ── ApiKeyGuard ───────────────────────────────────────────────────────────────

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let prisma: { aPIKey: { findFirst: jest.Mock; update: jest.Mock } };
  let audit: { log: jest.Mock };

  function buildExecCtx(headerKey: string | undefined) {
    const request: Record<string, unknown> = {
      headers: headerKey !== undefined ? { 'x-api-key': headerKey } : {},
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      _request: request,
    } as unknown as ExecutionContext & { _request: Record<string, unknown> };
  }

  beforeEach(() => {
    prisma = { aPIKey: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    guard = new ApiKeyGuard(prisma as never, audit as never);
  });

  // ── Test 11: invalid API key ───────────────────────────────────────────────

  it('11. invalid API key (not in DB) → UnauthorizedException', async () => {
    prisma.aPIKey.findFirst.mockResolvedValue(null);
    const ctx = buildExecCtx('knef_abc_nonexistent');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid API key');
  });

  // ── Test 10: malformed API key ────────────────────────────────────────────

  it('10. empty API key → UnauthorizedException', async () => {
    const ctx = buildExecCtx('');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('10. missing x-api-key header → UnauthorizedException', async () => {
    const ctx = buildExecCtx(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('10. whitespace-only API key → UnauthorizedException', async () => {
    const ctx = buildExecCtx('   ');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  // ── Test 8: revoked API key ───────────────────────────────────────────────

  it('8. revoked API key (isActive=false) → UnauthorizedException', async () => {
    prisma.aPIKey.findFirst.mockResolvedValue(
      buildApiKey({ isActive: false }),
    );
    const ctx = buildExecCtx('knef_abc_somekey');

    await expect(guard.canActivate(ctx)).rejects.toThrow('API key has been revoked');
  });

  it('8. revoked key → audit log recorded with reason=revoked', async () => {
    prisma.aPIKey.findFirst.mockResolvedValue(
      buildApiKey({ id: 'key-revoked', organizationId: 'org-1', isActive: false }),
    );
    const ctx = buildExecCtx('knef_abc_somekey');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    // Audit is fire-and-forget (.catch) so just verify the call was made
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'API_KEY_AUTH_DENIED',
        entityId: 'key-revoked',
        metadata: expect.objectContaining({ reason: 'revoked' }),
      }),
    );
  });

  // ── Test 9: expired API key ───────────────────────────────────────────────

  it('9. expired API key → UnauthorizedException', async () => {
    prisma.aPIKey.findFirst.mockResolvedValue(
      buildApiKey({ expiresAt: new Date('2020-01-01') }),
    );
    const ctx = buildExecCtx('knef_abc_somekey');

    await expect(guard.canActivate(ctx)).rejects.toThrow('API key expired');
  });

  it('9. expired key → audit log recorded with reason=expired', async () => {
    const expiresAt = new Date('2020-01-01');
    prisma.aPIKey.findFirst.mockResolvedValue(
      buildApiKey({ id: 'key-expired', expiresAt }),
    );
    const ctx = buildExecCtx('knef_abc_somekey');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'API_KEY_AUTH_DENIED',
        entityId: 'key-expired',
        metadata: expect.objectContaining({ reason: 'expired' }),
      }),
    );
  });

  // ── Test 1 / 16 / 17: valid key → attaches context ───────────────────────

  it('16/17. valid active non-expired key → sets request.apiKey and request.organizationId', async () => {
    const apiKey = buildApiKey({ organizationId: 'org-42', scopes: ['products:read'] });
    prisma.aPIKey.findFirst.mockResolvedValue(apiKey);
    const ctx = buildExecCtx('knef_valid_key');

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect((ctx as { _request: Record<string, unknown> })._request['organizationId']).toBe('org-42');
    expect((ctx as { _request: Record<string, unknown> })._request['apiKey']).toBe(apiKey);
  });

  // ── Test 12: org isolation — key always carries its own orgId ─────────────

  it('12. organizationId on request always comes from the database record, not the request', async () => {
    const apiKey = buildApiKey({ organizationId: 'org-legitimate' });
    prisma.aPIKey.findFirst.mockResolvedValue(apiKey);
    const ctx = buildExecCtx('knef_valid_key');

    await guard.canActivate(ctx);
    expect((ctx as { _request: Record<string, unknown> })._request['organizationId']).toBe('org-legitimate');
  });

  // ── Non-expired key edge case ─────────────────────────────────────────────

  it('key with future expiry → allowed', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    prisma.aPIKey.findFirst.mockResolvedValue(buildApiKey({ expiresAt: future }));
    const ctx = buildExecCtx('knef_valid_key');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('key with null expiry → allowed (never expires)', async () => {
    prisma.aPIKey.findFirst.mockResolvedValue(buildApiKey({ expiresAt: null }));
    const ctx = buildExecCtx('knef_valid_key');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Audit never called for valid key ─────────────────────────────────────

  it('audit NOT called for valid key', async () => {
    prisma.aPIKey.findFirst.mockResolvedValue(buildApiKey());
    const ctx = buildExecCtx('knef_valid_key');

    await guard.canActivate(ctx);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
