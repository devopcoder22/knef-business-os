'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, FileText, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SalesOrder {
  id: string;
  reference: string;
  status: string;
  totalAmount: string;
  customer: { firstName: string; lastName: string } | null;
  createdAt: string;
}

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

export default function NewInvoicePage() {
  const router = useRouter();

  const [mode, setMode] = useState<'order' | 'standalone'>('order');
  const [orderId, setOrderId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: '', quantity: '1', unitPrice: '' }]);

  const { data: ordersData } = useQuery<{ data: SalesOrder[] }>({
    queryKey: ['sales-orders-for-invoice'],
    queryFn: async () => {
      const res = await api().get('/sales-orders?limit=50&status=CONFIRMED');
      const confirmed: SalesOrder[] = (res.data as any).data ?? [];
      const res2 = await api().get('/sales-orders?limit=50&status=COMPLETED');
      const completed: SalesOrder[] = (res2.data as any).data ?? [];
      const res3 = await api().get('/sales-orders?limit=50&status=PROCESSING');
      const processing: SalesOrder[] = (res3.data as any).data ?? [];
      const all = [...confirmed, ...completed, ...processing];
      const seen = new Set<string>();
      return { data: all.filter((o) => { if (seen.has(o.id)) return false; seen.add(o.id); return true; }) };
    },
  });

  const { data: customersData } = useQuery<{ data: Customer[] }>({
    queryKey: ['customers-for-invoice'],
    queryFn: async () => {
      const res = await api().get('/customers?limit=100');
      return res.data;
    },
    enabled: mode === 'standalone',
  });

  const standaloneTotal = lineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.unitPrice || '0') * parseInt(item.quantity || '1', 10));
  }, 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        dueDate: dueDate || undefined,
        notes: notes || undefined,
      };
      if (mode === 'order' && orderId) {
        payload['orderId'] = orderId;
      }
      if (customerId) payload['customerId'] = customerId;

      if (mode === 'standalone') {
        const validItems = lineItems.filter((i) => i.description.trim() && i.unitPrice);
        if (validItems.length > 0) {
          payload['items'] = validItems.map((i) => ({
            description: i.description.trim(),
            quantity: parseInt(i.quantity || '1', 10),
            unitPrice: i.unitPrice,
          }));
        }
      }

      const res = await api().post<{ id: string }>('/invoices', payload);
      return (res.data as any).data.id as string;
    },
    onSuccess: (invId) => router.push(`/sales/invoices/${invId}`),
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to create invoice';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'order' && !orderId) {
      setError('Please select a sales order');
      return;
    }
    setError('');
    createMutation.mutate();
  };

  const selectedOrder = ordersData?.data?.find((o) => o.id === orderId);

  const addLineItem = () => setLineItems((prev) => [...prev, { description: '', quantity: '1', unitPrice: '' }]);
  const removeLineItem = (i: number) => setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateLineItem = (i: number, field: keyof LineItem, value: string) => {
    setLineItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Invoice</h1>
          <p className="text-gray-500 text-sm mt-1">Generate an invoice from a sales order</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Mode toggle */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode('order')}
              className={cn(
                'flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-colors',
                mode === 'order'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              )}
            >
              From Sales Order
            </button>
            <button
              type="button"
              onClick={() => setMode('standalone')}
              className={cn(
                'flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-colors',
                mode === 'standalone'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              )}
            >
              Standalone Invoice
            </button>
          </div>

          {mode === 'order' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sales Order <span className="text-red-500">*</span>
              </label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a confirmed/completed order...</option>
                {ordersData?.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.reference}
                    {o.customer ? ` — ${o.customer.firstName} ${o.customer.lastName}` : ''}
                    {' '}({o.status}) —{' '}
                    {Number(o.totalAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                  </option>
                ))}
              </select>
              {ordersData?.data?.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No confirmed/completed orders found. Orders must be confirmed or completed before invoicing.
                </p>
              )}
              {selectedOrder && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                  <strong>{selectedOrder.reference}</strong> &bull;{' '}
                  {selectedOrder.customer
                    ? `${selectedOrder.customer.firstName} ${selectedOrder.customer.lastName}`
                    : 'Walk-in'}{' '}
                  &bull; {Number(selectedOrder.totalAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer (optional)</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Walk-in / No customer</option>
                  {customersData?.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} — {c.phone}
                    </option>
                  ))}
                </select>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Line Items</label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus size={12} />
                    Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {lineItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <input
                          type="text"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="Qty"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(i, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          placeholder="Unit Price"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(i, 'unitPrice', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(i)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {standaloneTotal > 0 && (
                  <div className="mt-2 text-right text-sm font-semibold text-gray-900">
                    Total: {standaloneTotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Payment terms, special instructions..."
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
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
            <FileText size={16} />
            {createMutation.isPending ? 'Creating...' : 'Generate Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
