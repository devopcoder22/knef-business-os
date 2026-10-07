/**
 * SearchController — unit tests
 *
 * Verifies that the controller:
 *  - delegates to the service with the DTO as-is
 *  - sources organizationId from the AuthUser (never query params)
 *  - passes the parsed `types` string through unchanged
 */

import { ValidationPipe } from '@nestjs/common';
import type { AuthUser } from '@knef/types';
import { SearchController } from './search.controller';
import { GlobalSearchDto } from './dto/global-search.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    email: 'u@example.com',
    firstName: 'U',
    lastName: 'One',
    roles: [],
    permissions: ['products.view'],
    locationIds: null,
    ...overrides,
  };
}

describe('SearchController', () => {
  it('invokes the service with the AuthUser and DTO', async () => {
    const globalSearch: jest.Mock = jest.fn(async () => ({ query: 'ok', total: 0, results: [], byType: {} }));
    const svc = { globalSearch };
    const ctl = new SearchController(svc as never);

    const user = makeUser({ organizationId: 'org-99' });
    const dto: GlobalSearchDto = { q: 'hello', types: 'PRODUCT', limit: 5 } as GlobalSearchDto;

    await ctl.globalSearch(user, dto);

    expect(globalSearch).toHaveBeenCalledWith(user, dto);
    const call = globalSearch.mock.calls[0] as [AuthUser, GlobalSearchDto];
    expect(call[0].organizationId).toBe('org-99');
  });

  it('passes DTO through verbatim (types string is preserved)', async () => {
    const globalSearch: jest.Mock = jest.fn(async () => ({ query: 'ok', total: 0, results: [], byType: {} }));
    const svc = { globalSearch };
    const ctl = new SearchController(svc as never);

    const dto = { q: 'xx', types: 'PRODUCT,CUSTOMER' } as GlobalSearchDto;
    await ctl.globalSearch(makeUser(), dto);

    const call = globalSearch.mock.calls[0] as [AuthUser, GlobalSearchDto];
    expect(call[1].types).toBe('PRODUCT,CUSTOMER');
  });

  it('ignores a client-supplied organizationId in the query (whitelist strips it)', async () => {
    // The global ValidationPipe is configured with whitelist + forbidNonWhitelisted;
    // reproduce that behaviour here and ensure the DTO drops unknown fields.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const transformed = await pipe.transform(
      { q: 'hello', organizationId: 'ATTACKER-ORG' } as never,
      { type: 'query', metatype: GlobalSearchDto, data: '' },
    );
    expect((transformed as Record<string, unknown>).organizationId).toBeUndefined();
    expect((transformed as GlobalSearchDto).q).toBe('hello');
  });
});

describe('GlobalSearchDto validation', () => {
  it('rejects q shorter than 2 chars', async () => {
    const instance = plainToInstance(GlobalSearchDto, { q: 'a' });
    const errors = await validate(instance);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.minLength).toBeTruthy();
  });

  it('rejects q longer than 100 chars', async () => {
    const instance = plainToInstance(GlobalSearchDto, { q: 'x'.repeat(101) });
    const errors = await validate(instance);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.maxLength).toBeTruthy();
  });

  it('accepts a valid 2-char query', async () => {
    const instance = plainToInstance(GlobalSearchDto, { q: 'hi' });
    const errors = await validate(instance);
    expect(errors).toEqual([]);
  });

  it('trims the query', async () => {
    const instance = plainToInstance(GlobalSearchDto, { q: '  hello  ' });
    expect(instance.q).toBe('hello');
  });

  it('clamps limit to [1, 10]', async () => {
    const high = plainToInstance(GlobalSearchDto, { q: 'hi', limit: 50 });
    const errors = await validate(high);
    expect(errors.some((e) => e.constraints?.max)).toBe(true);

    const low = plainToInstance(GlobalSearchDto, { q: 'hi', limit: 0 });
    const errors2 = await validate(low);
    expect(errors2.some((e) => e.constraints?.min)).toBe(true);
  });
});
