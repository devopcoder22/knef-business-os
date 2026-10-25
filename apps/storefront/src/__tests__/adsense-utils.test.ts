import {
  isExcludedRoute,
  isValidPublisherId,
  buildAdsTxtLine,
  MANDATORY_EXCLUDED_ROUTES,
} from '../lib/adsense-utils';

// ── isExcludedRoute ───────────────────────────────────────────────────────────

describe('isExcludedRoute — mandatory exclusions', () => {
  it('exact /cart is excluded', () => {
    expect(isExcludedRoute('/cart')).toBe(true);
  });

  it('exact /checkout is excluded', () => {
    expect(isExcludedRoute('/checkout')).toBe(true);
  });

  it('nested /checkout/payment is excluded', () => {
    expect(isExcludedRoute('/checkout/payment')).toBe(true);
  });

  it('nested /checkout/review is excluded', () => {
    expect(isExcludedRoute('/checkout/review')).toBe(true);
  });

  it('/order is excluded', () => {
    expect(isExcludedRoute('/order')).toBe(true);
  });

  it('/order/ABC123 is excluded', () => {
    expect(isExcludedRoute('/order/ABC123')).toBe(true);
  });

  it('/account is excluded', () => {
    expect(isExcludedRoute('/account')).toBe(true);
  });

  it('/account/orders is excluded', () => {
    expect(isExcludedRoute('/account/orders')).toBe(true);
  });

  it('/login is excluded', () => {
    expect(isExcludedRoute('/login')).toBe(true);
  });

  it('/register is excluded', () => {
    expect(isExcludedRoute('/register')).toBe(true);
  });

  it('/forgot-password is excluded', () => {
    expect(isExcludedRoute('/forgot-password')).toBe(true);
  });

  it('/reset-password is excluded', () => {
    expect(isExcludedRoute('/reset-password')).toBe(true);
  });

  it('/api is excluded', () => {
    expect(isExcludedRoute('/api')).toBe(true);
  });

  it('/api/storefront/otp is excluded', () => {
    expect(isExcludedRoute('/api/storefront/otp')).toBe(true);
  });
});

describe('isExcludedRoute — eligible routes', () => {
  it('home page / is eligible', () => {
    expect(isExcludedRoute('/')).toBe(false);
  });

  it('/products is eligible', () => {
    expect(isExcludedRoute('/products')).toBe(false);
  });

  it('/products/some-id is eligible', () => {
    expect(isExcludedRoute('/products/some-id')).toBe(false);
  });

  it('/categories is eligible', () => {
    expect(isExcludedRoute('/categories')).toBe(false);
  });

  it('/search is eligible', () => {
    expect(isExcludedRoute('/search')).toBe(false);
  });

  it('/contact is eligible', () => {
    expect(isExcludedRoute('/contact')).toBe(false);
  });

  it('/terms is eligible', () => {
    expect(isExcludedRoute('/terms')).toBe(false);
  });

  it('/privacy is eligible', () => {
    expect(isExcludedRoute('/privacy')).toBe(false);
  });
});

describe('isExcludedRoute — trailing slash safety', () => {
  it('/checkout/ is excluded', () => {
    expect(isExcludedRoute('/checkout/')).toBe(true);
  });

  it('/cart/ is excluded', () => {
    expect(isExcludedRoute('/cart/')).toBe(true);
  });
});

describe('isExcludedRoute — partial segment safety', () => {
  it('/cartography is NOT excluded (partial segment match rejected)', () => {
    expect(isExcludedRoute('/cartography')).toBe(false);
  });

  it('/checkout-confirm is NOT excluded', () => {
    expect(isExcludedRoute('/checkout-confirm')).toBe(false);
  });

  it('/orders is NOT excluded (different from /order)', () => {
    expect(isExcludedRoute('/orders')).toBe(false);
  });
});

describe('isExcludedRoute — extra routes', () => {
  it('extra route /promo is excluded when provided', () => {
    expect(isExcludedRoute('/promo', ['/promo'])).toBe(true);
  });

  it('/promo/summer is excluded when /promo is extra', () => {
    expect(isExcludedRoute('/promo/summer', ['/promo'])).toBe(true);
  });

  it('/home is not excluded without extra routes', () => {
    expect(isExcludedRoute('/home', [])).toBe(false);
  });
});

// ── isValidPublisherId ────────────────────────────────────────────────────────

describe('isValidPublisherId', () => {
  it('valid ca-pub-DIGITS format passes', () => {
    expect(isValidPublisherId('ca-pub-1234567890123456')).toBe(true);
  });

  it('short valid id passes', () => {
    expect(isValidPublisherId('ca-pub-1')).toBe(true);
  });

  it('empty string is invalid', () => {
    expect(isValidPublisherId('')).toBe(false);
  });

  it('missing ca-pub prefix is invalid', () => {
    expect(isValidPublisherId('pub-1234567890')).toBe(false);
  });

  it('letters after ca-pub- are invalid', () => {
    expect(isValidPublisherId('ca-pub-abcdef')).toBe(false);
  });

  it('script injection attempt is invalid', () => {
    expect(isValidPublisherId('ca-pub-<script>alert(1)</script>')).toBe(false);
  });

  it('HTML injection attempt is invalid', () => {
    expect(isValidPublisherId('ca-pub-123" onload="evil()')).toBe(false);
  });

  it('mixed digits and letters after prefix is invalid', () => {
    expect(isValidPublisherId('ca-pub-123abc456')).toBe(false);
  });

  it('whitespace in id is invalid', () => {
    expect(isValidPublisherId('ca-pub-123 456')).toBe(false);
  });
});

// ── buildAdsTxtLine ───────────────────────────────────────────────────────────

describe('buildAdsTxtLine', () => {
  it('produces correct IAB format for known publisher ID', () => {
    const line = buildAdsTxtLine('ca-pub-1234567890123456');
    expect(line).toBe('google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
  });

  it('strips ca-pub- prefix correctly', () => {
    const line = buildAdsTxtLine('ca-pub-9876543210');
    expect(line).toContain('pub-9876543210');
    expect(line).not.toContain('ca-pub-');
  });

  it('includes required DIRECT tag token', () => {
    const line = buildAdsTxtLine('ca-pub-1');
    expect(line).toContain('DIRECT');
    expect(line).toContain('f08c47fec0942fa0');
  });

  it('always ends with newline', () => {
    const line = buildAdsTxtLine('ca-pub-123');
    expect(line.endsWith('\n')).toBe(true);
  });
});

// ── MANDATORY_EXCLUDED_ROUTES completeness ────────────────────────────────────

describe('MANDATORY_EXCLUDED_ROUTES covers all required paths', () => {
  const required = ['/cart', '/checkout', '/order', '/account', '/login', '/register',
    '/forgot-password', '/reset-password', '/api'];

  required.forEach((route) => {
    it(`includes ${route}`, () => {
      expect(MANDATORY_EXCLUDED_ROUTES).toContain(route as (typeof MANDATORY_EXCLUDED_ROUTES)[number]);
    });
  });
});
