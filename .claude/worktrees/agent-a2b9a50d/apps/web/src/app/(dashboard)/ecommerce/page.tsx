'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  Key,
  Plus,
  Copy,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface OnlineOrder {
  id: string;
  reference: string;
  status: string;
  channel: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
  completedAt: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  } | null;
  location: { id: string; name: string };
  _count: { items: number };
}

interface OrdersResponse {
  data: OnlineOrder[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ApiKeysResponse {
  data: ApiKey[];
}

interface NewKeyResponse {
  id: string;
  name: string;
  prefix: string;
  key: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-purple-100 text-purple-700',
  PARTIAL_REFUND: 'bg-orange-100 text-orange-700',
};

function formatCurrency(amount: string, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(
    parseFloat(amount),
  );
}

export default function EcommercePage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState('read');
  const [revealedKey, setRevealedKey] = useState<NewKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: ordersData, isLoading: ordersLoading } = useQuery<OrdersResponse>({
    queryKey: ['ecommerce-orders', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await api().get<OrdersResponse>(`/ecommerce/orders?${params}`);
      return res.data;
    },
  });

  const { data: keysData, isLoading: keysLoading } = useQuery<ApiKeysResponse>({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await api().get<ApiKeysResponse>('/ecommerce/api-keys');
      return res.data;
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api().post<{ message: string }>(`/ecommerce/orders/${orderId}/fulfill`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-orders'] });
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: async (data: { name: string; scopes: string[] }) => {
      const res = await api().post<NewKeyResponse>('/ecommerce/api-keys', data);
      return res.data;
    },
    onSuccess: (data) => {
      setRevealedKey(data);
      setShowKeyModal(false);
      setNewKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await api().delete(`/ecommerce/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const orders = ordersData?.data ?? [];
  const keys = keysData?.data ?? [];

  const handleCopyKey = async () => {
    if (revealedKey) {
      await navigator.clipboard.writeText(revealedKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateKey = () => {
    createKeyMutation.mutate({
      name: newKeyName,
      scopes: newKeyScopes.split(',').map((s) => s.trim()).filter(Boolean),
    });
  };

  // Summary stats
  const totalRevenue = orders
    .filter((o) => o.status === 'COMPLETED')
    .reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);
  const confirmedOrders = orders.filter((o) => o.status === 'CONFIRMED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">E-commerce</h1>
        <p className="text-gray-500 text-sm mt-1">Manage online orders and API access keys</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Globe size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Online Orders (loaded)</p>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Awaiting Fulfillment</p>
              <p className="text-2xl font-bold text-gray-900">{confirmedOrders}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Revenue (Completed)</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalRevenue.toString())}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Revealed API Key (shown once) */}
      {revealedKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="font-semibold text-amber-800 mb-2">
            API Key created — copy it now, it will not be shown again
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-white border border-amber-300 rounded px-3 py-2 text-sm font-mono text-gray-800 truncate">
              {revealedKey.key}
            </code>
            <button
              onClick={handleCopyKey}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
            >
              <Copy size={14} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setRevealedKey(null)}
              className="text-amber-600 hover:text-amber-800"
            >
              <XCircle size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Online Orders */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Online Orders</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {ordersLoading ? (
          <div className="p-8 text-center text-gray-400">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No online orders found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">
                      {order.reference}
                    </td>
                    <td className="px-5 py-3">
                      {order.customer ? (
                        <div>
                          <p className="font-medium text-gray-900">
                            {order.customer.firstName} {order.customer.lastName}
                          </p>
                          <p className="text-gray-400 text-xs">{order.customer.phone}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {formatCurrency(order.totalAmount, order.currency)}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      {order.status === 'CONFIRMED' && (
                        <button
                          onClick={() => fulfillMutation.mutate(order.id)}
                          disabled={fulfillMutation.isPending}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          Fulfill
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900">API Keys</h2>
          </div>
          <button
            onClick={() => setShowKeyModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={14} />
            Generate Key
          </button>
        </div>

        {keysLoading ? (
          <div className="p-8 text-center text-gray-400">Loading keys...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No API keys yet. Generate one to allow external storefronts to access your catalog.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium text-gray-900">{k.name}</p>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">{k.prefix}••••••••</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>Scopes: {k.scopes.join(', ') || 'none'}</span>
                    {k.lastUsedAt && (
                      <span>Last used: {new Date(k.lastUsedAt).toLocaleDateString()}</span>
                    )}
                    {k.expiresAt && (
                      <span>Expires: {new Date(k.expiresAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => revokeKeyMutation.mutate(k.id)}
                  disabled={revokeKeyMutation.isPending}
                  className="text-red-400 hover:text-red-600 disabled:opacity-40"
                  title="Revoke key"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Generate API Key</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Key Name
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Storefront Production"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Scopes (comma-separated)
                </label>
                <input
                  type="text"
                  value={newKeyScopes}
                  onChange={(e) => setNewKeyScopes(e.target.value)}
                  placeholder="read, orders:write"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim() || createKeyMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createKeyMutation.isPending ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
