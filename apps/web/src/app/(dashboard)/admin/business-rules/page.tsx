'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Scale,
  Settings,
  Clock,
  CheckCircle,
  AlertTriangle,
  ShoppingCart,
  Receipt,
  TrendingUp,
  RefreshCw,
  XCircle,
  History,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface RuleSetting {
  id: string;
  key: string;
  value: string;
  type: string;
  group: string;
  label: string;
  description?: string;
}

interface RuleCheck {
  requiresApproval: boolean;
  threshold: number;
  observedValue: number;
  ruleId: string;
}

interface PendingPO {
  id: string;
  reference: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  supplier: { id: string; name: string };
  location: { id: string; name: string };
  ruleCheck: RuleCheck;
}

interface PendingExpense {
  id: string;
  reference: string;
  description: string;
  amount: number;
  currency: string;
  vendor?: string;
  date: string;
  createdAt: string;
  category?: { id: string; name: string } | null;
  ruleCheck: RuleCheck;
}

interface HistoryPO {
  id: string;
  reference: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  approvedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  approvedBy?: string;
  supplier: { id: string; name: string };
  location: { id: string; name: string };
}

interface HistoryExpense {
  id: string;
  reference: string;
  description: string;
  amount: number;
  currency: string;
  vendor?: string;
  status: string;
  date: string;
  approvedAt?: string;
  notes?: string;
  category?: { id: string; name: string } | null;
}

interface ApprovalQueue {
  purchaseOrders: PendingPO[];
  expenses: PendingExpense[];
  stats: {
    totalPendingPOs: number;
    totalPendingExpenses: number;
    highValuePOs: number;
    highValueExpenses: number;
  };
}

interface ApprovalHistory {
  purchaseOrders: HistoryPO[];
  expenses: HistoryExpense[];
}

const PERCENT_KEYS = ['rules.sales.max_discount_percent', 'rules.sales.min_margin_percent'];

const RULE_LABELS: Record<string, { label: string; description: string; icon: React.ElementType; unit: string; min: number; max?: number }> = {
  'rules.sales.max_discount_percent': {
    label: 'Max Discount %',
    description: 'Maximum discount allowed on a sales order',
    icon: TrendingUp,
    unit: '%',
    min: 0,
    max: 100,
  },
  'rules.sales.min_margin_percent': {
    label: 'Min Margin %',
    description: 'Minimum gross margin required on a sales order',
    icon: TrendingUp,
    unit: '%',
    min: 0,
    max: 100,
  },
  'rules.purchasing.approval_threshold_ngn': {
    label: 'PO Approval Threshold',
    description: 'Purchase orders above this amount are flagged for elevated review',
    icon: ShoppingCart,
    unit: '₦',
    min: 0,
  },
  'rules.expense.approval_threshold_ngn': {
    label: 'Expense Approval Threshold',
    description: 'Expenses above this amount require explicit approval',
    icon: Receipt,
    unit: '₦',
    min: 0,
  },
  'rules.sales.refund_approval_threshold_ngn': {
    label: 'Refund Approval Threshold',
    description: 'Refunds above this amount require explicit approval',
    icon: RefreshCw,
    unit: '₦',
    min: 0,
  },
};

type Tab = 'rules' | 'queue' | 'history';

export default function BusinessRulesPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const canEdit = hasPermission(PERMISSIONS.SETTINGS.EDIT);
  const [tab, setTab] = useState<Tab>('rules');
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { data: rulesData, isLoading: rulesLoading, isError: rulesError } = useQuery<{ data: RuleSetting[] }>({
    queryKey: ['business-rules'],
    queryFn: () => api().get('/business-rules').then((r) => r.data),
  });

  const { data: queueData, isLoading: queueLoading, isError: queueError } = useQuery<ApprovalQueue>({
    queryKey: ['business-rules-queue'],
    queryFn: () => api().get('/business-rules/approvals/queue').then((r) => r.data),
    enabled: tab === 'queue',
  });

  const { data: historyData, isLoading: historyLoading, isError: historyError } = useQuery<ApprovalHistory>({
    queryKey: ['business-rules-history'],
    queryFn: () => api().get('/business-rules/approvals/history').then((r) => r.data),
    enabled: tab === 'history',
  });

  const updateMutation = useMutation({
    mutationFn: async (settings: { key: string; value: string }[]) => {
      await api().patch('/business-rules', { settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-rules'] });
      setEditMode(false);
      setEditValues({});
      setValidationErrors({});
    },
  });

  const approvePOMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/purchase-orders/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-rules-queue'] });
      queryClient.invalidateQueries({ queryKey: ['business-rules-history'] });
    },
  });

  const cancelPOMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/purchase-orders/${id}/cancel`, { reason: 'Rejected via Admin Approval Queue' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-rules-queue'] });
      queryClient.invalidateQueries({ queryKey: ['business-rules-history'] });
    },
  });

  const approveExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/finance/expenses/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-rules-queue'] });
      queryClient.invalidateQueries({ queryKey: ['business-rules-history'] });
    },
  });

  const rejectExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/finance/expenses/${id}/reject`, { reason: 'Rejected via Admin Approval Queue' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-rules-queue'] });
      queryClient.invalidateQueries({ queryKey: ['business-rules-history'] });
    },
  });

  const rules = rulesData?.data ?? [];

  function startEdit() {
    const initial: Record<string, string> = {};
    for (const r of rules) initial[r.key] = r.value;
    setEditValues(initial);
    setEditMode(true);
    setValidationErrors({});
  }

  function cancelEdit() {
    setEditMode(false);
    setEditValues({});
    setValidationErrors({});
  }

  function handleValueChange(key: string, value: string) {
    setEditValues((prev) => ({ ...prev, [key]: value }));
    const meta = RULE_LABELS[key];
    const num = parseFloat(value);
    if (isNaN(num)) {
      setValidationErrors((prev) => ({ ...prev, [key]: 'Must be a valid number' }));
    } else if (meta?.max !== undefined && num > meta.max) {
      setValidationErrors((prev) => ({ ...prev, [key]: `Must be ≤ ${meta.max}` }));
    } else if (meta && num < meta.min) {
      setValidationErrors((prev) => ({ ...prev, [key]: `Must be ≥ ${meta.min}` }));
    } else {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function saveEdit() {
    if (Object.keys(validationErrors).length > 0) return;
    const settings = Object.entries(editValues).map(([key, value]) => ({ key, value }));
    updateMutation.mutate(settings);
  }

  function formatValue(key: string, value: string) {
    const meta = RULE_LABELS[key];
    if (!meta) return value;
    const num = parseFloat(value);
    if (meta.unit === '₦') return `₦${num.toLocaleString()}`;
    return `${num}${meta.unit}`;
  }

  const totalPending = queueData
    ? queueData.stats.totalPendingPOs + queueData.stats.totalPendingExpenses
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Scale size={24} className="text-blue-600" />
            Business Rules
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure approval thresholds and enforcement rules for purchasing, expenses, and sales.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-1 flex gap-1 w-fit">
        {([
          ['rules', 'Rule Configuration'],
          ['queue', 'Approval Queue'],
          ['history', 'History'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
            {t === 'queue' && totalPending > 0 && (
              <span className="ml-2 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {totalPending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Rule Configuration Tab ── */}
      {tab === 'rules' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Settings size={16} className="text-gray-500" />
              <span className="font-semibold text-gray-800 text-sm">Threshold Configuration</span>
            </div>
            {canEdit && !editMode && (
              <button
                onClick={startEdit}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Edit Rules
              </button>
            )}
            {editMode && (
              <div className="flex gap-2">
                <button
                  onClick={cancelEdit}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={updateMutation.isPending || Object.keys(validationErrors).length > 0}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>

          {rulesLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : rulesError ? (
            <div className="p-6 text-center text-red-600 text-sm">
              Failed to load business rules. Please refresh the page.
            </div>
          ) : rules.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              No business rules configured yet. Re-run the database seed to initialize defaults.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rules.map((rule) => {
                const meta = RULE_LABELS[rule.key];
                const Icon = meta?.icon ?? Settings;
                const isPercent = PERCENT_KEYS.includes(rule.key);
                const validationError = validationErrors[rule.key];
                return (
                  <div key={rule.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Icon size={16} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm">
                        {meta?.label ?? rule.key}
                      </div>
                      {meta?.description && (
                        <div className="text-xs text-gray-500 mt-0.5">{meta.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {editMode ? (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5">
                            {!isPercent && (
                              <span className="text-sm text-gray-500">₦</span>
                            )}
                            <input
                              type="number"
                              value={editValues[rule.key] ?? rule.value}
                              onChange={(e) => handleValueChange(rule.key, e.target.value)}
                              min={meta?.min ?? 0}
                              max={meta?.max}
                              step={isPercent ? 1 : 1000}
                              className={`w-32 text-right border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                validationError ? 'border-red-400' : 'border-gray-300'
                              }`}
                            />
                            {isPercent && (
                              <span className="text-sm text-gray-500">%</span>
                            )}
                          </div>
                          {validationError && (
                            <span className="text-xs text-red-600">{validationError}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-3 py-1 rounded-lg">
                          {formatValue(rule.key, rule.value)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {updateMutation.isError && (
            <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {(updateMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save rules. Please try again.'}
            </div>
          )}
        </div>
      )}

      {/* ── Approval Queue Tab ── */}
      {tab === 'queue' && (
        <div className="space-y-6">
          {queueError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              Failed to load approval queue. Please refresh.
            </div>
          )}

          {/* Stats */}
          {queueData && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Pending POs', value: queueData.stats.totalPendingPOs, icon: ShoppingCart },
                { label: 'High-Value POs', value: queueData.stats.highValuePOs, icon: AlertTriangle },
                { label: 'Pending Expenses', value: queueData.stats.totalPendingExpenses, icon: Receipt },
                { label: 'High-Value Expenses', value: queueData.stats.highValueExpenses, icon: AlertTriangle },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">{stat.label}</div>
                  <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Pending Purchase Orders */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <ShoppingCart size={15} className="text-gray-500" />
              <span className="font-semibold text-sm text-gray-800">Pending Purchase Orders</span>
            </div>
            {queueLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !queueData?.purchaseOrders.length ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                <CheckCircle size={32} className="mx-auto mb-2 text-gray-200" />
                No pending purchase orders
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {queueData.purchaseOrders.map((po) => (
                  <div key={po.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-gray-900 font-mono">{po.reference}</span>
                        {po.ruleCheck.requiresApproval && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                            <AlertTriangle size={10} /> High-value
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-3">
                        <span>{po.supplier.name}</span>
                        <span>·</span>
                        <span>{po.location.name}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {format(new Date(po.createdAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right mr-4">
                      <div className="font-semibold text-gray-900 text-sm">
                        ₦{po.totalAmount.toLocaleString()}
                      </div>
                      {po.ruleCheck.requiresApproval && (
                        <div className="text-xs text-amber-600">
                          Above ₦{po.ruleCheck.threshold.toLocaleString()} threshold
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => approvePOMutation.mutate(po.id)}
                        disabled={approvePOMutation.isPending || cancelPOMutation.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle size={12} /> Approve
                      </button>
                      <button
                        onClick={() => cancelPOMutation.mutate(po.id)}
                        disabled={approvePOMutation.isPending || cancelPOMutation.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <XCircle size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Expenses */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Receipt size={15} className="text-gray-500" />
              <span className="font-semibold text-sm text-gray-800">Pending Expenses</span>
            </div>
            {queueLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !queueData?.expenses.length ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                <CheckCircle size={32} className="mx-auto mb-2 text-gray-200" />
                No pending expenses
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {queueData.expenses.map((exp) => (
                  <div key={exp.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-gray-900 truncate max-w-xs">{exp.description}</span>
                        {exp.ruleCheck.requiresApproval && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full flex items-center gap-1 flex-shrink-0">
                            <AlertTriangle size={10} /> High-value
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-3">
                        {exp.vendor && <span>{exp.vendor}</span>}
                        {exp.category && (
                          <>
                            <span>·</span>
                            <span>{exp.category.name}</span>
                          </>
                        )}
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {format(new Date(exp.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right mr-4">
                      <div className="font-semibold text-gray-900 text-sm">
                        ₦{exp.amount.toLocaleString()}
                      </div>
                      {exp.ruleCheck.requiresApproval && (
                        <div className="text-xs text-amber-600">
                          Above ₦{exp.ruleCheck.threshold.toLocaleString()} threshold
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveExpenseMutation.mutate(exp.id)}
                        disabled={approveExpenseMutation.isPending || rejectExpenseMutation.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle size={12} /> Approve
                      </button>
                      <button
                        onClick={() => rejectExpenseMutation.mutate(exp.id)}
                        disabled={approveExpenseMutation.isPending || rejectExpenseMutation.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <div className="space-y-6">
          {historyError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              Failed to load approval history. Please refresh.
            </div>
          )}

          {/* Resolved Purchase Orders */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <History size={15} className="text-gray-500" />
              <span className="font-semibold text-sm text-gray-800">Purchase Order History</span>
            </div>
            {historyLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !historyData?.purchaseOrders.length ? (
              <div className="p-8 text-center text-gray-400 text-sm">No resolved purchase orders yet</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {historyData.purchaseOrders.map((po) => (
                  <div key={po.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-gray-900 font-mono">{po.reference}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          po.status === 'APPROVED'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {po.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-3">
                        <span>{po.supplier.name}</span>
                        <span>·</span>
                        <span>{po.location.name}</span>
                        {po.cancelReason && (
                          <>
                            <span>·</span>
                            <span className="text-red-500">{po.cancelReason}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 text-sm">
                        ₦{po.totalAmount.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-400 flex items-center justify-end gap-1 mt-0.5">
                        <Clock size={10} />
                        {format(new Date(po.approvedAt ?? po.cancelledAt ?? po.createdAt), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resolved Expenses */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <History size={15} className="text-gray-500" />
              <span className="font-semibold text-sm text-gray-800">Expense History</span>
            </div>
            {historyLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !historyData?.expenses.length ? (
              <div className="p-8 text-center text-gray-400 text-sm">No resolved expenses yet</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {historyData.expenses.map((exp) => (
                  <div key={exp.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-gray-900 truncate max-w-xs">{exp.description}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${
                          exp.status === 'APPROVED'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {exp.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-3">
                        {exp.vendor && <span>{exp.vendor}</span>}
                        {exp.category && (
                          <>
                            <span>·</span>
                            <span>{exp.category.name}</span>
                          </>
                        )}
                        {exp.notes && exp.status === 'REJECTED' && (
                          <>
                            <span>·</span>
                            <span className="text-red-500">{exp.notes}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 text-sm">
                        ₦{exp.amount.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-400 flex items-center justify-end gap-1 mt-0.5">
                        <Clock size={10} />
                        {format(new Date(exp.approvedAt ?? exp.date), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
