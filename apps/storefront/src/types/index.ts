// ─── Public API response shape ────────────────────────────────────────────────

export interface PublicApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Product types ────────────────────────────────────────────────────────────

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  options: Record<string, string>;
}

export interface ProductImage {
  id?: string;
  url: string;
  altText?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface ProductListItem {
  id: string;
  name: string;
  sku: string;
  gtin: string | null;
  barcode: string | null;
  description: string | null;
  shortDesc: string | null;
  sellingPrice: string;
  comparePrice: string | null;
  status: 'ACTIVE';
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  primaryImage: { url: string } | null;
  variants: ProductVariant[];
  stock: number | null;
}

export interface ProductDetail extends ProductListItem {
  metaTitle: string | null;
  metaDesc: string | null;
  weight: string | null;
  weightUnit: string | null;
  images: ProductImage[];
  inventoryByLocation: Array<{
    locationId: string;
    locationName: string;
    quantity: number;
    reserved: number;
    available: number;
  }>;
}

// ─── Category types ───────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  children: Omit<Category, 'children'>[];
}

// ─── Cart types ───────────────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  stock: number | null;
}

// ─── Order types ──────────────────────────────────────────────────────────────

export interface CreateOrderPayload {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  locationId: string;
  notes?: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }>;
}

export interface OrderConfirmation {
  orderId: string;
  reference: string;
  totalAmount: string;
  discountAmount?: string;
  giftCardAmount?: string;
  amountDue?: string;
  status: string;
  /** Present when the order needs a Paystack card payment to complete. */
  payment?: {
    provider: 'paystack';
    reference: string;
    accessCode: string;
    authorizationUrl: string;
  } | null;
  linkedToAccount?: boolean;
  /** Present when an account was created at checkout — log the customer in with these. */
  account?: {
    accessToken: string;
    refreshToken: string;
    customer: { id: string; email: string; firstName: string; lastName: string };
  } | null;
  accountError?: string | null;
}

export interface PaystackVerifyResult {
  status: 'paid' | 'pending' | 'failed';
  orderReference?: string;
}

export interface OrderDetail {
  id: string;
  reference: string;
  status: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
  items: Array<{
    product: { id: string; name: string; sku: string };
    variant: { id: string; name: string; sku: string } | null;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
  }>;
}
