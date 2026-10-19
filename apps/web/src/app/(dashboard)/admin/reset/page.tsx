'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  Trash2,
  Package,
  Layers,
  Truck,
  ShoppingBag,
  DollarSign,
  Users,
  UserX,
  CheckSquare,
  Square,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

type ResetCategory =
  | 'products'
  | 'inventory'
  | 'purchasing'
  | 'orders'
  | 'finance'
  | 'customers'
  | 'staff';

interface CategoryConfig {
  id: ResetCategory;
  label: string;
  desc: string;
  color: string;
  icon: React.ElementType;
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: 'products',
    label: 'Products & Catalogue',
    desc: 'All products, variants, categories, brands and inventory levels',
    color: 'blue',
    icon: Package,
  },
  {
    id: 'inventory',
    label: 'Inventory Records',
    desc: 'Stock counts, adjustments, transfers and serialized units',
    color: 'teal',
    icon: Layers,
  },
  {
    id: 'purchasing',
    label: 'Purchasing & Suppliers',
    desc: 'Purchase orders, goods receipts, suppliers and supplier invoices',
    color: 'purple',
    icon: Truck,
  },
  {
    id: 'orders',
    label: 'Sales Orders',
    desc: 'All customer orders, order items, invoices and receipts',
    color: 'orange',
    icon: ShoppingBag,
  },
  {
    id: 'finance',
    label: 'Finance & Payments',
    desc: 'Payments, expenses, bank accounts and transactions',
    color: 'green',
    icon: DollarSign,
  },
  {
    id: 'customers',
    label: 'Customers & Accounts',
    desc: 'All customers, storefront accounts, notes and tags',
    color: 'pink',
    icon: Users,
  },
  {
    id: 'staff',
    label: 'Staff & Users',
    desc: 'All staff users except you and super admins',
    color: 'red',
    icon: UserX,
  },
];

const COLOR_MAP: Record<string, string> = {
  blue: 'border-blue-200 bg-blue-50',
  teal: 'border-teal-200 bg-teal-50',
  purple: 'border-purple-200 bg-purple-50',
  orange: 'border-orange-200 bg-orange-50',
  green: 'border-green-200 bg-green-50',
  pink: 'border-pink-200 bg-pink-50',
  red: 'border-red-200 bg-red-50',
};

const ICON_COLOR_MAP: Record<string, string> = {
  blue: 'text-blue-600',
  teal: 'text-teal-600',
  purple: 'text-purple-600',
  orange: 'text-orange-600',
  green: 'text-green-600',
  pink: 'text-pink-600',
  red: 'text-red-600',
};

interface ResetResult {
  success: boolean;
  deleted: Record<string, number>;
}

export default function AdminResetPage() {
  const { hasPermission } = useAuthStore();
  const canReset = hasPermission(PERMISSIONS.ADMIN.MANAGE_USERS);

  const [selected, setSelected] = useState<Set<ResetCategory>>(new Set());
  const [confirmText, setConfirmText] = useState('');
  const [result, setResult] = useState<ResetResult | null>(null);

  const allSelected = selected.size === CATEGORIES.length;

  const toggleCategory = (id: ResetCategory) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(CATEGORIES.map((c) => c.id)));
    }
  };

  const resetMutation = useMutation({
    mutationFn: async (categories: ResetCategory[]) => {
      const res = await api().post('/admin/reset', { categories });
      return ((res.data as any)?.data ?? res.data) as ResetResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setSelected(new Set());
      setConfirmText('');
    },
  });

  const canSubmit =
    canReset &&
    selected.size > 0 &&
    confirmText === 'RESET' &&
    !resetMutation.isPending;

  const handleReset = () => {
    if (!canSubmit) return;
    resetMutation.mutate(Array.from(selected));
  };

  if (!canReset) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          You do not have permission to access this page.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Reset</h1>
        <p className="mt-1 text-sm text-gray-500">
          Permanently wipe selected data categories from your organisation.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-5 py-4">
        <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-red-600" />
        <p className="text-sm font-medium text-red-700">
          This is irreversible. Deleted data cannot be recovered.
        </p>
      </div>

      {result && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-5 py-4 space-y-2">
          <p className="font-semibold text-green-800">Reset completed successfully.</p>
          <ul className="text-sm text-green-700 space-y-1">
            {Object.entries(result.deleted).map(([cat, count]) => (
              <li key={cat}>
                <span className="capitalize font-medium">{cat}</span>: {count} record
                {count !== 1 ? 's' : ''} deleted
              </li>
            ))}
          </ul>
        </div>
      )}

      {resetMutation.isError && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700">
          {resetMutation.error instanceof Error
            ? resetMutation.error.message
            : 'An unexpected error occurred. Please try again.'}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          {selected.size} of {CATEGORIES.length} categories selected
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CATEGORIES.map((cat) => {
          const isChecked = selected.has(cat.id);
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => toggleCategory(cat.id)}
              className={[
                'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
                isChecked
                  ? `${COLOR_MAP[cat.color]} border-${cat.color}-400`
                  : 'border-gray-200 bg-white hover:border-gray-300',
              ].join(' ')}
            >
              <div className="mt-0.5 flex-shrink-0">
                {isChecked ? (
                  <CheckSquare size={18} className={ICON_COLOR_MAP[cat.color]} />
                ) : (
                  <Square size={18} className="text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon
                    size={15}
                    className={isChecked ? ICON_COLOR_MAP[cat.color] : 'text-gray-500'}
                  />
                  <span className="text-sm font-semibold text-gray-900">{cat.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{cat.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <label htmlFor="confirm-reset" className="block text-sm font-medium text-gray-700">
          Type <span className="font-mono font-bold text-red-600">RESET</span> to confirm
        </label>
        <input
          id="confirm-reset"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="RESET"
          autoComplete="off"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
        />
      </div>

      <button
        type="button"
        onClick={handleReset}
        disabled={!canSubmit}
        className={[
          'flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all',
          canSubmit
            ? 'bg-red-600 text-white hover:bg-red-700 shadow-sm'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed',
        ].join(' ')}
      >
        {resetMutation.isPending ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Resetting…
          </>
        ) : (
          <>
            <Trash2 size={16} />
            Reset Selected Data
          </>
        )}
      </button>
    </div>
  );
}
