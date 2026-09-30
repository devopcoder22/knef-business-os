'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Minus, Trash2, ShoppingCart, X, CheckCircle, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ---- Types ----
interface Location {
  id: string;
  name: string;
  code: string;
}

interface POSSession {
  id: string;
  reference: string;
  status: string;
  openingFloat: string;
  totalSales: string;
  openedAt: string;
  location: Location;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  costPrice: string;
  hasVariants: boolean;
  category: { name: string } | null;
}

interface ProductsResponse {
  data: Product[];
}

interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountRate: number;
}

interface PaymentSplit {
  method: string;
  amount: string;
}

interface ReceiptData {
  reference: string;
  items: { product: { name: string; sku: string } | null; quantity: number; unitPrice: string; totalPrice: string }[];
  subtotal: string;
  discount: string;
  total: string;
  payments: PaymentSplit[];
  change: string;
  customer: { firstName: string; lastName: string; phone: string } | null;
  timestamp: string;
}

const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'POS_TERMINAL', 'USSD'];

// ---- Receipt Modal ----
function ReceiptModal({ receipt, onClose }: { receipt: ReceiptData; onClose: () => void }) {
  const printReceipt = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-sm w-full shadow-2xl">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Receipt</h3>
          <div className="flex gap-2">
            <button
              onClick={printReceipt}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Printer size={14} />
              Print
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4 print:p-2">
          <div className="text-center">
            <p className="font-bold text-lg">KNEF Gadgets</p>
            <p className="text-xs text-gray-500 font-mono">{receipt.reference}</p>
            <p className="text-xs text-gray-400">{new Date(receipt.timestamp).toLocaleString()}</p>
          </div>

          {receipt.customer && (
            <div className="text-sm border-t border-dashed border-gray-300 pt-3">
              <p className="font-medium">{receipt.customer.firstName} {receipt.customer.lastName}</p>
              <p className="text-gray-500 text-xs">{receipt.customer.phone}</p>
            </div>
          )}

          <div className="border-t border-dashed border-gray-300 pt-3 space-y-1">
            {receipt.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <div className="flex-1">
                  <p>{item.product?.name ?? 'Item'}</p>
                  <p className="text-xs text-gray-400">x{item.quantity} @ {Number(item.unitPrice).toLocaleString()}</p>
                </div>
                <p className="font-medium">
                  {Number(item.totalPrice).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-gray-300 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{Number(receipt.subtotal).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
            </div>
            {parseFloat(receipt.discount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{Number(receipt.discount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-gray-300 pt-1 mt-1">
              <span>Total</span>
              <span>{Number(receipt.total).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
            </div>
            {receipt.payments.map((p, i) => (
              <div key={i} className="flex justify-between text-gray-600">
                <span>{p.method.replace('_', ' ')}</span>
                <span>{Number(p.amount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
              </div>
            ))}
            {parseFloat(receipt.change) > 0 && (
              <div className="flex justify-between text-blue-700 font-medium">
                <span>Change</span>
                <span>{Number(receipt.change).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-gray-400 pt-3 border-t border-dashed border-gray-300">
            Thank you for shopping at KNEF Gadgets!
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Open Session Modal ----
function OpenSessionModal({
  locations,
  onOpen,
  onClose,
}: {
  locations: Location[];
  onOpen: (locationId: string, openingFloat: number) => void;
  onClose: () => void;
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [openingFloat, setOpeningFloat] = useState('0');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Open POS Session</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Opening Float (NGN)</label>
          <input
            type="number"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            min="0"
            step="100"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => locationId && onOpen(locationId, parseFloat(openingFloat) || 0)}
            disabled={!locationId}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Open Session
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Close Session Modal ----
function CloseSessionModal({
  session,
  onClose,
  onConfirm,
}: {
  session: POSSession;
  onClose: () => void;
  onConfirm: (closingFloat: number, notes: string) => void;
}) {
  const [closingFloat, setClosingFloat] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Close POS Session</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Session</span>
            <span className="font-mono">{session.reference}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Opening Float</span>
            <span>{Number(session.openingFloat).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Total Sales</span>
            <span>{Number(session.totalSales).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
          </div>
          <div className="flex justify-between font-medium text-gray-900 border-t border-gray-200 pt-2">
            <span>Expected Cash</span>
            <span>
              {(parseFloat(session.openingFloat) + parseFloat(session.totalSales)).toLocaleString('en-NG', {
                style: 'currency',
                currency: 'NGN',
              })}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Closing Float (NGN)</label>
          <input
            type="number"
            value={closingFloat}
            onChange={(e) => setClosingFloat(e.target.value)}
            min="0"
            step="100"
            placeholder="Enter actual cash in drawer"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(parseFloat(closingFloat) || 0, notes)}
            disabled={!closingFloat}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            Close Session
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main POS Page ----
export default function POSPage() {
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  // Session state
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');

  // Payment state
  const [showPaymentScreen, setShowPaymentScreen] = useState(false);
  const [payments, setPayments] = useState<PaymentSplit[]>([{ method: 'CASH', amount: '' }]);

  // Receipt
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  // --- Queries ---
  const { data: sessionData, isLoading: sessionLoading } = useQuery<POSSession>({
    queryKey: ['pos-current-session'],
    queryFn: async () => {
      const res = await api().get<POSSession>('/pos/sessions/current');
      return res.data;
    },
    retry: false,
  });
  const session = sessionData;

  const { data: locationsData } = useQuery<{ data: Location[] }>({
    queryKey: ['locations-list'],
    queryFn: async () => {
      const res = await api().get<{ data: Location[] }>('/locations?limit=100');
      return res.data;
    },
  });
  const locations = locationsData?.data ?? [];

  const { data: productsData } = useQuery<ProductsResponse>({
    queryKey: ['pos-products', productSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (productSearch) params.set('search', productSearch);
      const res = await api().get<ProductsResponse>(`/products?${params}`);
      return res.data;
    },
    enabled: !!session,
  });
  const products = productsData?.data ?? [];

  const { data: customersData } = useQuery<{ data: { id: string; firstName: string; lastName: string; phone: string }[] }>({
    queryKey: ['pos-customers', customerSearch],
    queryFn: async () => {
      const res = await api().get(`/customers?search=${customerSearch}&limit=10`);
      return res.data;
    },
    enabled: !!session && customerSearch.length >= 2,
  });
  const customers = customersData?.data ?? [];

  // --- Mutations ---
  const openSessionMutation = useMutation({
    mutationFn: async ({ locationId, openingFloat }: { locationId: string; openingFloat: number }) => {
      const res = await api().post<POSSession>('/pos/sessions/open', { locationId, openingFloat });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-current-session'] });
      setShowOpenModal(false);
    },
  });

  const closeSessionMutation = useMutation({
    mutationFn: async ({ closingFloat, notes }: { closingFloat: number; notes: string }) => {
      await api().post(`/pos/sessions/${session!.id}/close`, { closingFloat, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-current-session'] });
      setShowCloseModal(false);
      setCart([]);
    },
  });

  const processSaleMutation = useMutation({
    mutationFn: async () => {
      const validPayments = payments.filter((p) => parseFloat(p.amount) > 0);
      const res = await api().post<{ receipt: ReceiptData }>(`/pos/sessions/${session!.id}/sale`, {
        items: cart.map((item) => ({
          productId: item.productId,
          variantId: undefined,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          costPrice: String(item.costPrice),
          discountRate: String(item.discountRate),
        })),
        payments: validPayments.map((p) => ({ method: p.method, amount: p.amount })),
        customerId: selectedCustomerId,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setReceipt(data.receipt);
      setCart([]);
      setPayments([{ method: 'CASH', amount: '' }]);
      setShowPaymentScreen(false);
      setSelectedCustomerId(null);
      setSelectedCustomerName('');
      queryClient.invalidateQueries({ queryKey: ['pos-current-session'] });
    },
  });

  // --- Cart helpers ---
  const addToCart = useCallback((product: Product) => {
    const key = product.id;
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === key);
      if (existing) {
        return prev.map((item) =>
          item.productId === key ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unitPrice: parseFloat(product.sellingPrice),
          costPrice: parseFloat(product.costPrice),
          discountRate: 0,
        },
      ];
    });
    setProductSearch('');
  }, []);

  const updateQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === key ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const removeFromCart = (key: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== key));
  };

  const setDiscount = (key: string, discount: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.productId === key ? { ...item, discountRate: Math.min(100, Math.max(0, discount)) } : item,
      ),
    );
  };

  // Totals
  const cartSubtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const cartDiscount = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity * item.discountRate) / 100, 0);
  const cartTotal = cartSubtotal - cartDiscount;

  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const change = Math.max(0, totalPaid - cartTotal);
  const remaining = Math.max(0, cartTotal - totalPaid);

  // Auto-fill first payment amount when entering payment screen
  useEffect(() => {
    if (showPaymentScreen && cartTotal > 0) {
      setPayments([{ method: 'CASH', amount: cartTotal.toFixed(2) }]);
    }
  }, [showPaymentScreen, cartTotal]);

  // ---- No session ----
  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-400 text-sm">Loading POS...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShoppingCart size={32} className="text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">No Active Session</h2>
          <p className="text-gray-500 text-sm mt-1">Open a POS session to start selling</p>
        </div>
        <button
          onClick={() => setShowOpenModal(true)}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          Open Session
        </button>

        {showOpenModal && (
          <OpenSessionModal
            locations={locations}
            onOpen={(locationId, openingFloat) => openSessionMutation.mutate({ locationId, openingFloat })}
            onClose={() => setShowOpenModal(false)}
          />
        )}
      </div>
    );
  }

  // ---- Payment screen ----
  if (showPaymentScreen) {
    return (
      <div className="h-full flex flex-col space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPaymentScreen(false)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-bold text-gray-900">Payment</h2>
          <span className="text-2xl font-bold text-gray-900 ml-auto">
            {cartTotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Payment Methods</h3>
          {payments.map((pay, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                value={pay.method}
                onChange={(e) => {
                  const updated = [...payments];
                  updated[i] = { ...updated[i], method: e.target.value };
                  setPayments(updated);
                }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m.replace('_', ' ')}</option>
                ))}
              </select>
              <input
                type="number"
                value={pay.amount}
                onChange={(e) => {
                  const updated = [...payments];
                  updated[i] = { ...updated[i], amount: e.target.value };
                  setPayments(updated);
                }}
                placeholder="Amount"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {payments.length > 1 && (
                <button
                  onClick={() => setPayments(payments.filter((_, j) => j !== i))}
                  className="p-2 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setPayments([...payments, { method: 'CASH', amount: '' }])}
            className="text-sm text-blue-600 hover:underline"
          >
            + Add payment method
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Total</span>
            <span className="font-bold text-gray-900">{cartTotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Paid</span>
            <span>{totalPaid.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
          </div>
          {remaining > 0.001 && (
            <div className="flex justify-between text-amber-600 font-medium">
              <span>Remaining</span>
              <span>{remaining.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
            </div>
          )}
          {change > 0.001 && (
            <div className="flex justify-between text-green-600 font-medium text-base border-t border-gray-200 pt-2">
              <span>Change</span>
              <span>{change.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => processSaleMutation.mutate()}
          disabled={totalPaid < cartTotal - 0.001 || processSaleMutation.isPending || cart.length === 0}
          className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-base hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <CheckCircle size={20} />
          {processSaleMutation.isPending ? 'Processing...' : 'Complete Sale'}
        </button>
      </div>
    );
  }

  // ---- Main POS interface ----
  return (
    <div className="h-full flex gap-4" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Left: Product Browser */}
      <div className="flex-1 flex flex-col space-y-3 min-w-0">
        {/* Session Bar */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-gray-900">{session.location.name}</span>
            <span className="font-mono text-xs text-gray-500">{session.reference}</span>
            <span className="text-xs text-gray-500">
              Sales: {Number(session.totalSales).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
            </span>
          </div>
          <button
            onClick={() => setShowCloseModal(true)}
            className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50"
          >
            Close Session
          </button>
        </div>

        {/* Product Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search products by name or SKU..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-blue-400 hover:shadow-sm transition-all group"
              >
                <div className="text-xs font-mono text-gray-400 mb-1">{product.sku}</div>
                <p className="text-sm font-medium text-gray-900 leading-tight group-hover:text-blue-600">
                  {product.name}
                </p>
                {product.category && (
                  <p className="text-xs text-gray-400 mt-0.5">{product.category.name}</p>
                )}
                {product.hasVariants && (
                  <p className="text-xs text-blue-400 mt-0.5">Has variants</p>
                )}
                <p className="text-sm font-bold text-gray-900 mt-2">
                  {Number(product.sellingPrice).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </p>
              </button>
            ))}
            {products.length === 0 && productSearch && (
              <div className="col-span-full py-12 text-center text-gray-400">
                <Search size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No products found</p>
              </div>
            )}
            {products.length === 0 && !productSearch && (
              <div className="col-span-full py-12 text-center text-gray-400">
                <p className="text-sm">Search for products to add to cart</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden flex-shrink-0">
        {/* Cart Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Cart</span>
            {cart.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700">
              Clear
            </button>
          )}
        </div>

        {/* Customer Search */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="relative">
            <input
              type="text"
              placeholder="Search customer (optional)..."
              value={selectedCustomerName || customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                if (selectedCustomerId) {
                  setSelectedCustomerId(null);
                  setSelectedCustomerName('');
                }
              }}
              className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {selectedCustomerId && (
              <button
                onClick={() => { setSelectedCustomerId(null); setSelectedCustomerName(''); setCustomerSearch(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {customers.length > 0 && !selectedCustomerId && customerSearch.length >= 2 && (
            <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomerId(c.id);
                    setSelectedCustomerName(`${c.firstName} ${c.lastName}`);
                    setCustomerSearch('');
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <p className="font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                  <p className="text-gray-400">{c.phone}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              <div className="text-center">
                <ShoppingCart size={24} className="mx-auto mb-2 opacity-40" />
                <p>Cart is empty</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {cart.map((item) => {
                const key = item.productId;
                const lineSubtotal = item.unitPrice * item.quantity;
                const lineDiscount = (lineSubtotal * item.discountRate) / 100;
                const lineTotal = lineSubtotal - lineDiscount;
                return (
                  <div key={key} className="px-3 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(key)}
                        className="text-gray-300 hover:text-red-500 flex-shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => updateQty(key, -1)}
                          className="px-2 py-1 text-gray-500 hover:bg-gray-100"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="text-xs font-medium px-1 min-w-[24px] text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(key, 1)}
                          className="px-2 py-1 text-gray-500 hover:bg-gray-100"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                      <span className="text-xs text-gray-500">
                        @{Number(item.unitPrice).toLocaleString()}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <input
                          type="number"
                          value={item.discountRate || ''}
                          onChange={(e) => setDiscount(key, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          min="0"
                          max="100"
                          className="w-12 text-xs border border-gray-200 rounded px-1 py-0.5 text-center"
                          title="Discount %"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-1.5">
                      {item.discountRate > 0 && (
                        <span className="text-xs text-green-600">
                          -{Number(lineDiscount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-gray-900 ml-auto">
                        {Number(lineTotal).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart Footer */}
        <div className="border-t border-gray-200 p-4 space-y-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{cartSubtotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
            </div>
            {cartDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{cartDiscount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2">
              <span>Total</span>
              <span>{cartTotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
            </div>
          </div>
          <button
            onClick={() => setShowPaymentScreen(true)}
            disabled={cart.length === 0}
            className={cn(
              'w-full py-3 rounded-xl font-semibold text-sm transition-colors',
              cart.length === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700',
            )}
          >
            Charge {cart.length > 0 ? cartTotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }) : ''}
          </button>
        </div>
      </div>

      {/* Modals */}
      {showCloseModal && (
        <CloseSessionModal
          session={session}
          onClose={() => setShowCloseModal(false)}
          onConfirm={(closingFloat, notes) => closeSessionMutation.mutate({ closingFloat, notes })}
        />
      )}

      {receipt && (
        <ReceiptModal
          receipt={receipt}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}
