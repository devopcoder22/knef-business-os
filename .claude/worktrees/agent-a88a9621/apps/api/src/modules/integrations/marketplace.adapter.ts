export interface ProductListing {
  id: string;
  name: string;
  sku: string;
  price: string;
  stock: number;
  description?: string;
  categoryName?: string;
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export interface MarketplaceOrder {
  externalId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: Array<{
    sku: string;
    quantity: number;
    unitPrice: string;
  }>;
  totalAmount: string;
  createdAt: Date;
}

export interface MarketplaceAdapter {
  name: string;
  syncProducts(orgId: string, products: ProductListing[]): Promise<SyncResult>;
  fetchOrders(orgId: string, since: Date): Promise<MarketplaceOrder[]>;
  updateStock(orgId: string, sku: string, qty: number): Promise<void>;
}

export class JumiaAdapter implements MarketplaceAdapter {
  name = 'jumia';

  async syncProducts(_orgId: string, products: ProductListing[]): Promise<SyncResult> {
    // Stub: In production, call Jumia Seller API
    return {
      synced: products.length,
      failed: 0,
      errors: [],
    };
  }

  async fetchOrders(_orgId: string, _since: Date): Promise<MarketplaceOrder[]> {
    // Stub: In production, fetch orders from Jumia
    return [];
  }

  async updateStock(_orgId: string, _sku: string, _qty: number): Promise<void> {
    // Stub: In production, update Jumia stock
  }
}

export class KongaAdapter implements MarketplaceAdapter {
  name = 'konga';

  async syncProducts(_orgId: string, products: ProductListing[]): Promise<SyncResult> {
    // Stub: In production, call Konga Merchant API
    return {
      synced: products.length,
      failed: 0,
      errors: [],
    };
  }

  async fetchOrders(_orgId: string, _since: Date): Promise<MarketplaceOrder[]> {
    // Stub: In production, fetch orders from Konga
    return [];
  }

  async updateStock(_orgId: string, _sku: string, _qty: number): Promise<void> {
    // Stub: In production, update Konga stock
  }
}
