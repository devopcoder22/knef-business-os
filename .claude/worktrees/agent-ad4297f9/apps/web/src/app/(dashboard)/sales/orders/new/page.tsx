'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Customer { id: string; firstName: string; lastName: string; phone: string }
interface Location { id: string; name: string; code: string }
interface Product { id: string; name: string; sku: string; sellingPrice: string; costPrice: string }

interface LineItem {
  productId: string;
  productName: string;
  productSku: string;
  quantity: string;
  unitPrice: string;
  costPrice: string;
  discountRate: string;
}

const CHANNELS = ['IN_STORE', 'PHONE', 'WHATSAPP', 'INSTAGRAM', 'ONLINE', 'OTHER'];

export default function NewSalesOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get('customerId') ?? '';

  const [customerId, setCustomerId] = useState(preselectedCustomerId);
  const [customerSearch, setCustomerSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [channel, setChannel] = useState('IN_STORE');
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: locationsData } = useQuery<{ data: Location[] }>({
    queryKey: ['locations-list'],
    queryFn: async () => {
      const res = await api().get<{ data: Location[] }>('/locations?limit=100');
      return res.data;
    },
  });

  const { data: customersData } = useQuery<{ data: Customer[] }>({
    queryKey: ['customers-search', customerSearch],
    queryFn: async () => {
      const res = await api().get<{ data: Customer[] }>(`/customers?limit=10&search=${customerSearch}`);
      return res.data;
    },
    enabled: customerSearch.length >= 2,
  });

  const { data: selectedCustomer } = useQuery<Customer>({
    queryKey: ['customer-single', customerId],
    queryFn: async () => {
      const res = await api().get<Customer>(`/customers/${customerId}`);
      return res.data;
    },
    enabled: !!customerId && !customerSearch,
  });

  const { data: productsData } = useQuery<{ data: Product[] }>({
    queryKey: ['products-search-so', productSearch],
    queryFn: async () => {
      const res = await api().get<{ data: Product[] }>(`/products?limit=10&search=${productSearch}`);
      return res.data;
    },
    enabled: productSearch.length >= 2,
  });

  const addProduct = (product: Product) => {
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        quantity: '1',
        unitPrice: product.sellingPrice,
        costPrice: product.costPrice,
        discountRate: '0',
      },
    ]);
    setProductSearch('');
  };

  const selectCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerSearch('');
  };

  const subtotal = items.reduce((sum, item) => {
    return sum + parseFloat(item.unitPrice || '0') * parseInt(item.quantity || '0', 10);
  }, 0);

  const discountTotal = items.reduce((sum, item) => {
    const base = parseFloat(item.unitPrice || '0') * parseInt(item.quantity || '0', 10);
    return sum + base * (parseFloat(item.discountRate || '0') / 100);
  }, 0);

  const total = subtotal - discountTotal;

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<{ id: string }>('/sales-orders', {
        customerId: customerId || undefined,
        locationId,
        channel,
        notes: notes || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: parseInt(item.quantity, 10),
          unitPrice: item.unitPrice,
          costPrice: item.costPrice,
          discountRate: item.discountRate || '0',
          taxRate: '0',
        })),
      });
      return (res.data as { id: string }).id;
    },
    onSuccess: (id) => router.push(`/sales/orders/${id}`),
    onError: (err: { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message ?? 'Failed to create order';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!locationId) errs['locationId'] = 'Location is required';
    if (items.length === 0) errs['items'] = 'At least one item is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Sales Order</h1>
          <p className="text-gray-500 text-sm mt-1">Create a sales transaction</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Order Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Order Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location <span className="text-red-500">*</span>
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={cn('w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500', errors.locationId ? 'border-red-300' : 'border-gray-200')}
              >
                <option value="">Select location...</option>
                {locationsData?.data?.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                ))}
              </select>
              {errors.locationId && <p className="text-xs text-red-500 mt-1">{errors.locationId}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sales Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CHANNELS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer (optional)</label>
              <div className="relative">
                {customerId && (selectedCustomer || preselectedCustomerId) ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-blue-50">
                    <span className="text-sm font-medium text-blue-900">
                      {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : 'Loading...'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomerId('')}
                      className="ml-auto text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <>
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search customer by name or phone..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {customersData && customersData.data.length > 0 && customerSearch.length >= 2 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1">
                        {customersData.data.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectCustomer(c)}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50"
                          >
                            <span className="font-medium">{c.firstName} {c.lastName}</span>
                            <span className="text-gray-400 text-xs">{c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Products</h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search and add products..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {productsData && productsData.data.length > 0 && productSearch.length >= 2 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1">
                {productsData.data.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50"
                  >
                    <div>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-gray-400 text-xs ml-2 font-mono">{p.sku}</span>
                    </div>
                    <span className="text-gray-600 text-xs">
                      {Number(p.sellingPrice).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {errors.items && <p className="text-xs text-red-500">{errors.items}</p>}

          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-lg">
              Search and add products above
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-700">Product</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-700 w-20">Qty</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-700 w-32">Unit Price</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-700 w-24">Disc %</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-700 w-28">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const lineTotal =
                    parseFloat(item.unitPrice || '0') *
                    parseInt(item.quantity || '0', 10) *
                    (1 - parseFloat(item.discountRate || '0') / 100);
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 px-2">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.productSku}</p>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => setItems((prev) => prev.map((it, j) => j === i ? { ...it, quantity: e.target.value } : it))}
                          min="1"
                          className="w-full px-2 py-1 text-center text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => setItems((prev) => prev.map((it, j) => j === i ? { ...it, unitPrice: e.target.value } : it))}
                          min="0"
                          step="0.01"
                          className="w-full px-2 py-1 text-right text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          value={item.discountRate}
                          onChange={(e) => setItems((prev) => prev.map((it, j) => j === i ? { ...it, discountRate: e.target.value } : it))}
                          min="0"
                          max="100"
                          className="w-full px-2 py-1 text-right text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-medium">
                        {lineTotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                      </td>
                      <td className="py-2 px-2">
                        <button type="button" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={3} />
                  <td className="py-3 px-2 text-right text-sm text-gray-600">Subtotal</td>
                  <td className="py-3 px-2 text-right font-medium">
                    {subtotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                  </td>
                  <td />
                </tr>
                {discountTotal > 0 && (
                  <tr>
                    <td colSpan={3} />
                    <td className="py-1 px-2 text-right text-sm text-red-600">Discount</td>
                    <td className="py-1 px-2 text-right text-red-600">
                      -{discountTotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                    </td>
                    <td />
                  </tr>
                )}
                <tr className="font-bold">
                  <td colSpan={3} />
                  <td className="py-2 px-2 text-right">Total</td>
                  <td className="py-2 px-2 text-right text-blue-700 text-base">
                    {total.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {errors.submit}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => { if (validate()) createMutation.mutate(); }}
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {createMutation.isPending ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
