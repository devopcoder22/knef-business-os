// All functions call the Next.js BFF route handlers (/api/*).
// The BFF holds STOREFRONT_BACKEND_URL and STOREFRONT_API_KEY server-side.
// The API key NEVER appears in browser JavaScript.

import type {
  PublicApiResponse,
  PaginatedMeta,
  ProductListItem,
  ProductDetail,
  Category,
  OrderConfirmation,
  OrderDetail,
} from '@/types';

const isServer = typeof window === 'undefined';
const BASE = isServer ? (process.env.STOREFRONT_INTERNAL_URL ?? 'http://localhost:3001') : '';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    const errField = (body as any).error;
    const message = typeof errField === 'string' ? errField
      : typeof errField === 'object' && errField?.message ? String(errField.message)
      : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface ProductsQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  inStock?: boolean;
  sort?: string;
}

export async function fetchProducts(
  query: ProductsQuery = {},
): Promise<PublicApiResponse<ProductListItem[]> & { meta: PaginatedMeta & Record<string, unknown> }> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.brandId) params.set('brandId', query.brandId);
  if (query.inStock) params.set('inStock', 'true');
  if (query.sort) params.set('sort', query.sort);
  const qs = params.toString();
  return apiFetch(`/api/catalog/products${qs ? `?${qs}` : ''}`);
}

export async function fetchProduct(id: string): Promise<PublicApiResponse<ProductDetail>> {
  return apiFetch(`/api/catalog/products/${encodeURIComponent(id)}`);
}

export async function fetchCategories(): Promise<PublicApiResponse<Category[]>> {
  return apiFetch('/api/catalog/categories');
}

export async function searchProducts(
  q: string,
  page = 1,
  limit = 20,
): Promise<PublicApiResponse<ProductListItem[]> & { meta: PaginatedMeta & Record<string, unknown> }> {
  const params = new URLSearchParams({ q, page: String(page), limit: String(limit) });
  return apiFetch(`/api/catalog/search?${params}`);
}

export interface CheckoutPayload {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryPhone?: string;
  deliveryMethod?: 'PICKUP' | 'DELIVERY';
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'PAYSTACK';
  paystackReference?: string;
  notes?: string;
  items: Array<{ productId: string; variantId?: string; quantity: number }>;
  idempotencyKey?: string;
  turnstileToken?: string;
  // NOTE: delivery fee is server-authoritative — never sent from the client.
  customerAccountId?: string;
}

export async function createOrder(
  payload: CheckoutPayload,
): Promise<PublicApiResponse<OrderConfirmation>> {
  return apiFetch('/api/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchOrder(
  reference: string,
  email: string,
): Promise<PublicApiResponse<OrderDetail>> {
  const params = new URLSearchParams({ email });
  return apiFetch(`/api/orders/${encodeURIComponent(reference)}?${params}`);
}

// ─── Customer auth ────────────────────────────────────────────────────────────

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  customer: { id: string; email: string; firstName: string; lastName: string };
}

export async function customerRegister(body: {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  password: string;
  turnstileToken?: string;
}): Promise<AuthResult> {
  return apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
}

export async function customerLogin(body: {
  email: string;
  password: string;
  turnstileToken?: string;
}): Promise<AuthResult> {
  return apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
}

export async function customerLogout(
  token: string,
  refreshToken: string,
): Promise<void> {
  await apiFetch('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ refreshToken }),
  });
}

export async function customerRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  return apiFetch('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function getProfile(token: string) {
  return apiFetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
}

export async function getMyOrders(token: string, page = 1) {
  return apiFetch(`/api/account/orders?page=${page}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getMyOrder(token: string, reference: string) {
  return apiFetch(`/api/account/orders/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface StorefrontSettings {
  storeName?: string;
  logoUrl?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroCtaText?: string;
  heroBadgeText?: string;
  featuredTitle?: string;
  categoryTitle?: string;
  ctaBannerTitle?: string;
  ctaBannerText?: string;
  announcementEnabled?: boolean;
  announcementText?: string;
  announcementColor?: string;
  footerDescription?: string;
  footerAddress?: string;
  footerPhone?: string;
  footerEmail?: string;
  // Social media links
  socialInstagramUrl?: string;
  socialFacebookUrl?: string;
  socialTiktokUrl?: string;
  socialTwitterUrl?: string;
  socialYoutubeUrl?: string;
  socialLinkedinUrl?: string;
  socialSnapchatUrl?: string;
  socialInstagramEnabled?: boolean;
  socialFacebookEnabled?: boolean;
  socialTiktokEnabled?: boolean;
  socialTwitterEnabled?: boolean;
  socialYoutubeEnabled?: boolean;
  socialLinkedinEnabled?: boolean;
  socialSnapchatEnabled?: boolean;
  // WhatsApp CTA
  whatsappNumber?: string;
  whatsappMessage?: string;
  whatsappEnabled?: boolean;
}

export async function fetchStorefrontSettings(): Promise<StorefrontSettings> {
  try {
    const res: { data: Array<{ key: string; value: string }> } = await apiFetch('/api/storefront-settings');
    const settings: StorefrontSettings = {};
    for (const item of res.data ?? []) {
      const shortKey = item.key.replace('storefront.', '') as keyof StorefrontSettings;
      const booleanKeys: Array<keyof StorefrontSettings> = [
        'announcementEnabled',
        'socialInstagramEnabled',
        'socialFacebookEnabled',
        'socialTiktokEnabled',
        'socialTwitterEnabled',
        'socialYoutubeEnabled',
        'socialLinkedinEnabled',
        'socialSnapchatEnabled',
        'whatsappEnabled',
      ];
      if (booleanKeys.includes(shortKey)) {
        (settings as any)[shortKey] = item.value === 'true';
      } else {
        (settings as any)[shortKey] = item.value;
      }
    }
    return settings;
  } catch {
    return {};
  }
}

// ─── OTP verification ─────────────────────────────────────────────────────────

export async function requestEmailOtp(email: string): Promise<{ message: string }> {
  return apiFetch('/api/storefront/otp/email', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function verifyEmailOtp(email: string, code: string): Promise<{ verified: boolean }> {
  return apiFetch('/api/storefront/otp/email/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
}

export async function requestSmsOtp(phone: string): Promise<{ message: string }> {
  return apiFetch('/api/storefront/otp/sms', { method: 'POST', body: JSON.stringify({ phone }) });
}

export async function verifySmsOtp(phone: string, code: string): Promise<{ verified: boolean }> {
  return apiFetch('/api/storefront/otp/sms/verify', { method: 'POST', body: JSON.stringify({ phone, code }) });
}

// ─── Post-order account creation ──────────────────────────────────────────────

export async function postOrderRegister(body: {
  orderReference: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}): Promise<AuthResult> {
  return apiFetch('/api/auth/post-order-register', { method: 'POST', body: JSON.stringify(body) });
}
