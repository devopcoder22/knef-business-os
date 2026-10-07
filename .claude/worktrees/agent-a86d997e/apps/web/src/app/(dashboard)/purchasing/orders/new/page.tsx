'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Plus, Trash2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Supplier { id: string; name: string; code: string }
interface Location { id: string; name: string; code: string }
interface Product { id: string; name: string; sku: string; costPrice: string }

interface LineItem {
  productId: string;
  productName: string;
  productSku: string;
  variantId: string;
  description: string;
  quantity: string;
  unitCost: string;
  taxRate: string;
  discountRate: string;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSupplierId = searchParams.get('supplierId') ?? '';

  const [supplierId, setSupplierId] = useState(preselectedSupplierId);
  const [locationId, setLocationId] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [items, setItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: suppliersData } = useQuery<{ data: Supplier[] }>({
    queryKey: ['suppliers-list'],
    queryFn: async () => {
      const res = await api().get<{ data: Supplier[] }>('/suppliers?limit=100&isActive=true');
      return res.data;
    },
  });

  const { data: locationsData } = useQuery<{ data: Location[] }>({
    queryKey: ['locations-list'],
    queryFn: async () => {
      const res = await api().get<{ data: Location[] }>('/locations?limit=100');
      return res.data;
    },
  });

  const { data: productsData } = useQuery<{ data: Product[] }>({
    queryKey: ['products-search-po', productSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '10' });
      if (productSearch) params.set('search', productSearch);
      const res = await api().get<{ data: Product[] }>(`/products?${params}`);
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
        variantId: '',
        description: '',
        quantity: '1',
        unitCost: product.costPrice,
        taxRate: '0',
        discountRate: '0',
      },
    ]);
    setProductSearch('');
  };

  const updateItem = (index: number, field: keyof LineItem, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => {
    const cost = parseFloat(item.unitCost || '0');
    const qty = parseInt(item.quantity || '0', 10);
    return sum + cost * qty;
  }, 0);

  const total = subtotal + parseFloat(shippingCost || '0') - parseFloat(discountAmount || '0');

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<{ id: string }>('/purchase-orders', {
        supplierId,
        locationId,
        currency,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
        shippingCost,
        discountAmount,
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId || undefined,
          description: item.description || undefined,
          quantity: parseInt(item.quantity, 10),
          unitCost: item.unitCost,
          taxRate: item.taxRate || '0',
          discountRate: item.discountRate || '0',
        })),
      });
      return (res.data as { id: string }).id;
    },
    onSuccess: (id) => router.push(`/purchasing/orders/${id}`),
    onError: (err: { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message ?? 'Failed to create purchase order';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!supplierId) errs['supplierId'] = 'Supplier is required';
    if (!locationId) errs['locationId'] = 'Location is required';
    if (items.length === 0) errs['items'] = 'At least one item is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) createMutation.mutate();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
          <p className="text-gray-500 text-sm mt-1">Create a procurement order</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Order Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier <span className="text-red-500">*</span>
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.supplierId ? 'border-red-300' : 'border-gray-200',
                )}
              >
                <option value="">Select supplier...</option>
                {suppliersData?.data?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
              {errors.supplierId && <p className="text-xs text-red-500 mt-1">{errors.supplierId}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Location <span className="text-red-500">*</span>
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.locationId ? 'border-red-300' : 'border-gray-200',
                )}
              >
                <option value="">Select location...</option>
                {locationsData?.data?.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                ))}
              </select>
              {errors.locationId && <p className="text-xs text-red-500 mt-1">{errors.locationId}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Date</label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="NGN">NGN</option>
                <option value="USD">USD</option>
              </select>
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Line Items</h2>
          </div>

          {/* Product search */}
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
                    <span className="font-medium">{p.name}</span>
                    <span className="text-gray-400 font-mono text-xs">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {errors.items && <p className="text-xs text-red-500">{errors.items}</p>}

          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-lg">
              Search and add products above to create line items
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Product</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-700 w-20">Qty</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 w-32">Unit Cost</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 w-24">Tax %</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 w-28">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const lineTotal =
                      parseFloat(item.unitCost || '0') * parseInt(item.quantity || '0', 10);
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
                            onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                            min="1"
                            className="w-full px-2 py-1 text-center text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            value={item.unitCost}
                            onChange={(e) => updateItem(i, 'unitCost', e.target.value)}
                            min="0"
                            step="0.01"
                            className="w-full px-2 py-1 text-right text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            value={item.taxRate}
                            onChange={(e) => updateItem(i, 'taxRate', e.target.value)}
                            min="0"
                            max="100"
                            className="w-full px-2 py-1 text-right text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 px-2 text-right font-medium">
                          {lineTotal.toLocaleString('en-NG', {
                            style: 'currency',
                            currency: 'NGN',
                          })}
                        </td>
                        <td className="py-2 px-2">
                          <button
                            type="button"
                            onClick={() => removeItem(i)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <label className="text-gray-600">Shipping Cost</label>
                <input
                  type="number"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-32 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-gray-900">
                Subtotal:{' '}
                <strong>
                  {subtotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </strong>
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <label className="text-gray-600">Discount</label>
                <input
                  type="number"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-32 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-lg font-bold text-gray-900">
                Total:{' '}
                {total.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
              </span>
            </div>
          </div>
        </div>

        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {errors.submit}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {createMutation.isPending ? 'Creating...' : 'Create Purchase Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
