/**
 * LocationScopeService — getUserLocationIds security tests
 *
 * Verifies the fail-closed semantics of getUserLocationIds:
 *   null  → org-wide (explicit org-wide role assignment)
 *   []    → no roles → deny all (fail-closed)
 *   [...] → location-scoped
 */

import { LocationScopeService } from './location-scope.service';

function makeService(roles: Array<{ locationId: string | null }>) {
  const prisma = {
    userRole: {
      findMany: jest.fn(async () => roles),
    },
  };
  return new LocationScopeService(prisma as never);
}

describe('LocationScopeService.getUserLocationIds — fail-closed semantics', () => {
  it('1: user with no roles → returns [] (fail-closed, NOT org-wide)', async () => {
    const svc = makeService([]);
    const result = await svc.getUserLocationIds('user-no-roles');
    expect(result).toEqual([]);
    expect(result).not.toBeNull();
  });

  it('2: no-role user result treated as scoped (not org-wide)', async () => {
    const svc = makeService([]);
    const result = await svc.getUserLocationIds('user-no-roles');
    expect(svc.isOrgWide(result)).toBe(false);
  });

  it('3: no-role user cannot access any location via assertAccess', async () => {
    const { ForbiddenException } = require('@nestjs/common');
    const svc = makeService([]);
    const locationIds = await svc.getUserLocationIds('user-no-roles');
    expect(() => svc.assertAccess(locationIds, 'any-location')).toThrow(ForbiddenException);
  });

  it('4: user with one org-wide role (locationId=null) → returns null', async () => {
    const svc = makeService([{ locationId: null }]);
    const result = await svc.getUserLocationIds('user-org-wide');
    expect(result).toBeNull();
    expect(svc.isOrgWide(result)).toBe(true);
  });

  it('5: user with mixed roles (one org-wide, one scoped) → returns null (org-wide wins)', async () => {
    const svc = makeService([{ locationId: null }, { locationId: 'loc-L1' }]);
    const result = await svc.getUserLocationIds('user-mixed');
    expect(result).toBeNull();
  });

  it('6: user with only location-scoped roles → returns authorized location IDs', async () => {
    const svc = makeService([{ locationId: 'loc-L1' }, { locationId: 'loc-L2' }]);
    const result = await svc.getUserLocationIds('user-scoped');
    expect(result).toEqual(['loc-L1', 'loc-L2']);
  });

  it('7: L1-only scoped user cannot access L2 (assertAccess throws)', async () => {
    const { ForbiddenException } = require('@nestjs/common');
    const svc = makeService([{ locationId: 'loc-L1' }]);
    const locationIds = await svc.getUserLocationIds('user-l1');
    expect(() => svc.assertAccess(locationIds, 'loc-L2')).toThrow(ForbiddenException);
  });

  it('8: L1-only scoped user can access L1 (assertAccess does not throw)', async () => {
    const svc = makeService([{ locationId: 'loc-L1' }]);
    const locationIds = await svc.getUserLocationIds('user-l1');
    expect(() => svc.assertAccess(locationIds, 'loc-L1')).not.toThrow();
  });

  it('9: org-wide user can access any location (assertAccess never throws)', async () => {
    const svc = makeService([{ locationId: null }]);
    const locationIds = await svc.getUserLocationIds('user-org-wide');
    expect(() => svc.assertAccess(locationIds, 'any-location-id')).not.toThrow();
  });

  it('10: applyToWhere with [] locationIds adds { in: [] } forcing empty results', () => {
    const svc = makeService([]);
    const where: Record<string, unknown> = { organizationId: 'org1' };
    svc.applyToWhere(where, []);
    // { in: [] } means DB will return no rows — correct fail-closed behavior
    expect(where.locationId).toEqual({ in: [] });
  });
});
