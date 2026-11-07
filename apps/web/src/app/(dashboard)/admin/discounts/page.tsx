'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Tag,
  Plus,
  Pencil,
  Power,
  Trash2,
  X,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

interface DiscountCode {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  usageCount?: number;
}

interface ListResponse {
  data: DiscountCode[];
  total: number;
  limit: number;
  offset: number;
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function StatusBadge({ isActive, expiresAt, usedCount, maxUses }: {
  isActive: boolean;
  expiresAt: string | null;
  usedCount: number;
  maxUses: number | null;
}) {
  if (!isActive) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
        <Power size={10} /> Inactive
      </span>
    );
  }
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-600 rounded-full">
        <Clock size={10} /> Expired
      </span>
    );
  }
  if (maxUses !== null && usedCount >= maxUses) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
        <AlertCircle size={10} /> Exhausted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
      <CheckCircle size={10} /> Active
    </span>
  );
}

interface FormState {
  code: string;
  type: DiscountType;
  value: string;
  minOrderAmount: string;
  maxUses: string;
  expiresAt: string;
  description: string;
}

const defaultForm: FormState = {
  code: '',
  type: 'PERCENTAGE',
  value: '',
  minOrderAmount: '',
  maxUses: '',
  expiresAt: '',
  description: '',
};

export default function DiscountsPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const canManage = hasPermission(PERMISSIONS.ADMIN.MANAGE_USERS);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ['admin-discounts'],
    queryFn: () => api().get('/discounts').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => api().post('/discounts', body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      closeModal();
    },
    onError: (err: { response?: { data?: { error?: { message?: string }; message?: string } } }) => {
      setFormError(
        err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to create discount code',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      api().patch(`/discounts/${id}`, body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      closeModal();
    },
    onError: (err: { response?: { data?: { error?: { message?: string }; message?: string } } }) => {
      setFormError(
        err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to update discount code',
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api().patch(`/discounts/${id}`, { isActive }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api().delete(`/discounts/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(dc: DiscountCode) {
    setEditingId(dc.id);
    setForm({
      code: dc.code,
      type: dc.type,
      value: String(dc.value),
      minOrderAmount: dc.minOrderAmount != null ? String(dc.minOrderAmount) : '',
      maxUses: dc.maxUses != null ? String(dc.maxUses) : '',
      expiresAt: dc.expiresAt ? dc.expiresAt.substring(0, 10) : '',
      description: dc.description ?? '',
    });
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const value = parseFloat(form.value);
    if (isNaN(value) || value <= 0) {
      setFormError('Value must be a positive number');
      return;
    }
    if (form.type === 'PERCENTAGE' && value > 100) {
      setFormError('Percentage value cannot exceed 100');
      return;
    }

    const body = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value,
      ...(form.minOrderAmount ? { minOrderAmount: parseFloat(form.minOrderAmount) } : {}),
      ...(form.maxUses ? { maxUses: parseInt(form.maxUses, 10) } : {}),
      ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    };

    if (editingId) {
      const { code: _code, type: _type, ...updateBody } = body as typeof body & { code: string; type: string };
      updateMutation.mutate({ id: editingId, body: updateBody });
    } else {
      createMutation.mutate(body);
    }
  }

  const codes = data?.data ?? [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag size={24} className="text-blue-600" />
            Discount Codes
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Create and manage coupon codes for storefront orders.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Create Discount Code
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-red-600 text-sm">
            Failed to load discount codes. Please refresh.
          </div>
        ) : codes.length === 0 ? (
          <div className="p-12 text-center">
            <Tag size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-gray-500 text-sm">No discount codes yet.</p>
            {canManage && (
              <button
                onClick={openCreate}
                className="mt-3 text-sm text-blue-600 font-medium hover:underline"
              >
                Create your first code
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Code</th>
                  <th className="text-left px-5 py-3 font-medium">Type</th>
                  <th className="text-left px-5 py-3 font-medium">Value</th>
                  <th className="text-left px-5 py-3 font-medium">Min Order</th>
                  <th className="text-left px-5 py-3 font-medium">Uses</th>
                  <th className="text-left px-5 py-3 font-medium">Expires</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {codes.map((dc) => (
                  <tr key={dc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-semibold text-gray-900 tracking-wide">
                        {dc.code}
                      </span>
                      {dc.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">
                          {dc.description}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {dc.type === 'PERCENTAGE' ? 'Percentage' : 'Fixed Amount'}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-gray-900">
                      {dc.type === 'PERCENTAGE'
                        ? `${dc.value}%`
                        : `₦${Number(dc.value).toLocaleString()}`}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {dc.minOrderAmount != null
                        ? `₦${Number(dc.minOrderAmount).toLocaleString()}`
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {dc.usedCount}
                      {dc.maxUses != null ? ` / ${dc.maxUses}` : ' / ∞'}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs">
                      {dc.expiresAt
                        ? format(new Date(dc.expiresAt), 'MMM d, yyyy')
                        : <span className="text-gray-300">Never</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge
                        isActive={dc.isActive}
                        expiresAt={dc.expiresAt}
                        usedCount={dc.usedCount}
                        maxUses={dc.maxUses}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      {canManage && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(dc)}
                            title="Edit"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() =>
                              toggleMutation.mutate({ id: dc.id, isActive: !dc.isActive })
                            }
                            title={dc.isActive ? 'Deactivate' : 'Activate'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              dc.isActive
                                ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                            }`}
                          >
                            <Power size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Deactivate code "${dc.code}"?`)) {
                                deleteMutation.mutate(dc.id);
                              }
                            }}
                            title="Delete"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeModal}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? 'Edit Discount Code' : 'Create Discount Code'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Code */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Discount Code *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. SAVE20"
                    maxLength={50}
                    required
                    disabled={!!editingId}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  {!editingId && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <RefreshCw size={12} />
                      Generate
                    </button>
                  )}
                </div>
              </div>

              {/* Type + Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Type *
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as DiscountType }))}
                    disabled={!!editingId}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 bg-white"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED_AMOUNT">Fixed Amount (₦)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Value * {form.type === 'PERCENTAGE' ? '(%)' : '(₦)'}
                  </label>
                  <input
                    type="number"
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                    placeholder={form.type === 'PERCENTAGE' ? '0–100' : '0'}
                    min={0.01}
                    max={form.type === 'PERCENTAGE' ? 100 : undefined}
                    step="0.01"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Min Order + Max Uses */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Min Order Amount (₦)
                  </label>
                  <input
                    type="number"
                    value={form.minOrderAmount}
                    onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: e.target.value }))}
                    placeholder="Optional"
                    min={0}
                    step="0.01"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Max Uses
                  </label>
                  <input
                    type="number"
                    value={form.maxUses}
                    onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                    placeholder="Unlimited"
                    min={1}
                    step={1}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Expires At */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Expires At
                </label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  min={new Date().toISOString().substring(0, 10)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional note"
                  maxLength={500}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Error */}
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {formError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isPending
                    ? editingId
                      ? 'Saving...'
                      : 'Creating...'
                    : editingId
                    ? 'Save Changes'
                    : 'Create Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
