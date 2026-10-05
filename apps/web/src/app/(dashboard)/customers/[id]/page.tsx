'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  ShoppingCart,
  Plus,
  FileText,
  Receipt,
  MessageSquare,
  CheckSquare,
  Activity,
  Download,
  Trash2,
  Tag,
  Star,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

interface CustomerTag { id: string; name: string; color: string }

interface Customer {
  id: string; code: string; firstName: string; lastName: string;
  email: string | null; phone: string; altPhone: string | null;
  address: string | null; city: string | null; state: string | null;
  country: string; dateOfBirth: string | null; gender: string | null;
  notes: string | null; loyaltyPoints: number; totalSpent: string;
  creditLimit: string; outstandingBalance: string; isActive: boolean;
  createdAt: string; tags: CustomerTag[];
}

interface Metrics {
  data: {
    orderCount: number; completedOrders: number; totalSalesValue: number;
    totalAmountPaid: number; outstandingAmount: number; totalRefunds: number;
    averageOrderValue: number; firstPurchaseDate: string | null;
    latestPurchaseDate: string | null; daysSinceLastPurchase: number | null;
    purchaseFrequencyPerMonth: number | null; segments: string[];
  };
}

interface TimelineEvent {
  type: string; date: string;
  data: Record<string, unknown>;
}

interface Note { id: string; content: string; createdBy: string; createdAt: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNGN(val: number | string) {
  return Number(val).toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
}
function fmtDate(val: string | null | undefined) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-GB');
}
function fmtDateTime(val: string) {
  return new Date(val).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SEGMENT_BADGE: Record<string, { label: string; cls: string }> = {
  NEW: { label: 'New', cls: 'bg-blue-100 text-blue-700' },
  ACTIVE: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  REPEAT: { label: 'Repeat', cls: 'bg-indigo-100 text-indigo-700' },
  HIGH_VALUE: { label: 'High Value', cls: 'bg-amber-100 text-amber-700' },
  AT_RISK: { label: 'At Risk', cls: 'bg-orange-100 text-orange-700' },
  INACTIVE: { label: 'Inactive', cls: 'bg-gray-100 text-gray-500' },
  OUTSTANDING_BALANCE: { label: 'Balance Due', cls: 'bg-red-100 text-red-700' },
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-amber-100 text-amber-700',
  DRAFT: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
  UNPAID: 'bg-red-100 text-red-700',
  PARTIAL: 'bg-orange-100 text-orange-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
};

const TIMELINE_ICONS: Record<string, { icon: string; cls: string }> = {
  CUSTOMER_CREATED: { icon: '👤', cls: 'bg-blue-50 border-blue-200' },
  ORDER: { icon: '🛒', cls: 'bg-indigo-50 border-indigo-200' },
  INVOICE: { icon: '📄', cls: 'bg-amber-50 border-amber-200' },
  PAYMENT: { icon: '💳', cls: 'bg-green-50 border-green-200' },
  RECEIPT: { icon: '🧾', cls: 'bg-teal-50 border-teal-200' },
  NOTE: { icon: '📝', cls: 'bg-gray-50 border-gray-200' },
  TASK: { icon: '✅', cls: 'bg-purple-50 border-purple-200' },
};

const TABS = ['Overview', 'Timeline', 'Orders', 'Invoices', 'Receipts', 'Notes', 'Follow-ups', 'Statement'] as const;
type Tab = (typeof TABS)[number];

// ── Page ──────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [noteText, setNoteText] = useState('');
  const [stmtStart, setStmtStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [stmtEnd, setStmtEnd] = useState(() => new Date().toISOString().slice(0, 10));

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ['customer', id],
    queryFn: async () => (await api().get<Customer>(`/customers/${id}`)).data,
  });

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ['customer-metrics', id],
    queryFn: async () => (await api().get<Metrics>(`/customers/${id}/metrics`)).data,
    enabled: activeTab === 'Overview',
  });

  const { data: timeline, isLoading: timelineLoading } = useQuery<{ data: TimelineEvent[] }>({
    queryKey: ['customer-timeline', id],
    queryFn: async () => (await api().get<{ data: TimelineEvent[] }>(`/customers/${id}/timeline`)).data,
    enabled: activeTab === 'Timeline',
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<{ data?: unknown[]; length?: number } | unknown[]>({
    queryKey: ['customer-orders', id],
    queryFn: async () => (await api().get(`/customers/${id}/sales-history`)).data,
    enabled: activeTab === 'Orders',
  });

  const { data: invoices } = useQuery<{ data: unknown[] }>({
    queryKey: ['customer-invoices', id],
    queryFn: async () => (await api().get(`/customers/${id}/invoices`)).data,
    enabled: activeTab === 'Invoices',
  });

  const { data: receipts } = useQuery<{ data: unknown[] }>({
    queryKey: ['customer-receipts', id],
    queryFn: async () => (await api().get(`/customers/${id}/receipts`)).data,
    enabled: activeTab === 'Receipts',
  });

  const { data: notes, isLoading: notesLoading } = useQuery<{ data: Note[] }>({
    queryKey: ['customer-notes', id],
    queryFn: async () => (await api().get(`/customers/${id}/notes`)).data,
    enabled: activeTab === 'Notes',
  });

  const { data: tasks } = useQuery<{ data: unknown[] }>({
    queryKey: ['customer-tasks', id],
    queryFn: async () => (await api().get(`/tasks?customerId=${id}&limit=50`)).data,
    enabled: activeTab === 'Follow-ups',
  });

  const { data: statement, isLoading: stmtLoading } = useQuery({
    queryKey: ['customer-statement', id, stmtStart, stmtEnd],
    queryFn: async () =>
      (await api().get(`/customers/${id}/statement?startDate=${stmtStart}&endDate=${stmtEnd}`)).data,
    enabled: activeTab === 'Statement',
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addNote = useMutation({
    mutationFn: async (content: string) =>
      (await api().post(`/customers/${id}/notes`, { content })).data,
    onSuccess: () => {
      setNoteText('');
      void qc.invalidateQueries({ queryKey: ['customer-notes', id] });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) =>
      (await api().delete(`/customers/${id}/notes/${noteId}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-notes', id] }),
  });

  // ── PDF downloads ─────────────────────────────────────────────────────────

  async function downloadReceiptPdf(receiptId: string) {
    const res = await api().get(`/receipts/${receiptId}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = `receipt-${receiptId}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadStatementPdf() {
    const res = await api().get(
      `/customers/${id}/statement/pdf?startDate=${stmtStart}&endDate=${stmtEnd}`,
      { responseType: 'blob' },
    );
    const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = `statement-${id}-${stmtStart}-${stmtEnd}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-gray-100 rounded w-1/3" />
      <div className="h-4 bg-gray-100 rounded w-1/5" />
    </div>
  );
  if (!customer) return <div className="text-gray-500">Customer not found.</div>;

  const m = metrics?.data;
  const ordersArr = Array.isArray(orders) ? orders : (orders as { data?: unknown[] })?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 mt-1">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {customer.firstName} {customer.lastName}
            </h1>
            <span className="font-mono text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{customer.code}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', customer.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
              {customer.isActive ? 'Active' : 'Inactive'}
            </span>
            {m?.segments.map((seg) => {
              const b = SEGMENT_BADGE[seg];
              return b ? <span key={seg} className={cn('px-2 py-0.5 rounded-full text-xs font-medium', b.cls)}>{b.label}</span> : null;
            })}
            {customer.tags.map((tag) => (
              <span key={tag.id} className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: tag.color }}>
                <Tag size={9} className="inline mr-0.5" />{tag.name}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
            {customer.phone && <span className="flex items-center gap-1"><Phone size={12} />{customer.phone}</span>}
            {customer.email && <span className="flex items-center gap-1"><Mail size={12} />{customer.email}</span>}
            {customer.city && <span className="flex items-center gap-1"><MapPin size={12} />{[customer.city, customer.state].filter(Boolean).join(', ')}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href={`/tasks/new?customerId=${customer.id}&customerName=${encodeURIComponent(`${customer.firstName} ${customer.lastName}`)}`}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            <Plus size={14} />
            Follow-up
          </Link>
          <Link
            href={`/sales/new?customerId=${customer.id}`}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <ShoppingCart size={14} />
            New Order
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Lifetime Sales', value: fmtNGN(m?.totalSalesValue ?? Number(customer.totalSpent)), note: 'Completed orders' },
          { label: 'Total Paid', value: fmtNGN(m?.totalAmountPaid ?? 0), note: null },
          { label: 'Outstanding', value: fmtNGN(m?.outstandingAmount ?? Number(customer.outstandingBalance)), note: null, red: (m?.outstandingAmount ?? Number(customer.outstandingBalance)) > 0 },
          { label: 'Avg Order', value: m ? fmtNGN(m.averageOrderValue) : '—', note: `${m?.completedOrders ?? 0} orders` },
        ].map(({ label, value, note, red }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={cn('text-xl font-bold mt-1', red ? 'text-red-600' : 'text-gray-900')}>{value}</p>
            {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-200 scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0',
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── Overview ──────────────────────────────────────────────── */}
          {activeTab === 'Overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</h3>
                <InfoRow icon={<Phone size={13} />} label="Primary" value={customer.phone} />
                {customer.altPhone && <InfoRow icon={<Phone size={13} />} label="Alt" value={customer.altPhone} />}
                {customer.email && <InfoRow icon={<Mail size={13} />} label="Email" value={customer.email} />}
                {customer.address && <InfoRow icon={<MapPin size={13} />} label="Address" value={[customer.address, customer.city, customer.state, customer.country].filter(Boolean).join(', ')} />}
                <InfoRow icon={<Star size={13} />} label="Loyalty" value={`${customer.loyaltyPoints.toLocaleString()} pts`} />
                <InfoRow icon={<FileText size={13} />} label="Member since" value={fmtDate(customer.createdAt)} />
              </div>

              {/* Purchase behaviour */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Purchase Behaviour</h3>
                <InfoRow label="Total orders" value={String(m?.orderCount ?? '—')} />
                <InfoRow label="Completed orders" value={String(m?.completedOrders ?? '—')} />
                <InfoRow label="First purchase" value={fmtDate(m?.firstPurchaseDate ?? null)} />
                <InfoRow label="Last purchase" value={fmtDate(m?.latestPurchaseDate ?? null)} />
                <InfoRow
                  label="Days since last"
                  value={m?.daysSinceLastPurchase !== null && m?.daysSinceLastPurchase !== undefined ? `${m.daysSinceLastPurchase} days` : '—'}
                />
                <InfoRow
                  label="Purchase frequency"
                  value={m?.purchaseFrequencyPerMonth !== null && m?.purchaseFrequencyPerMonth !== undefined
                    ? `${m.purchaseFrequencyPerMonth.toFixed(1)}/month`
                    : '—'}
                />
                <InfoRow label="Total refunds" value={m ? fmtNGN(m.totalRefunds) : '—'} />
                <InfoRow label="Credit limit" value={fmtNGN(Number(customer.creditLimit))} />
              </div>

              {/* Static notes */}
              {customer.notes && (
                <div className="md:col-span-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Profile Note</h3>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{customer.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Timeline ──────────────────────────────────────────────── */}
          {activeTab === 'Timeline' && (
            <div className="space-y-3">
              {timelineLoading
                ? <LoadingSkeleton rows={6} />
                : (timeline?.data ?? []).length === 0
                ? <EmptyState icon={<Activity size={28} />} label="No activity yet" />
                : (timeline?.data ?? []).map((evt, i) => {
                  const meta = TIMELINE_ICONS[evt.type] ?? { icon: '•', cls: 'bg-gray-50 border-gray-200' };
                  const d = evt.data;
                  const ref = (d.reference ?? d.id ?? '') as string;
                  const amount = d.amount ?? d.totalAmount;
                  return (
                    <div key={i} className={cn('flex gap-3 p-3 rounded-lg border text-sm', meta.cls)}>
                      <span className="text-lg flex-shrink-0 mt-0.5">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 capitalize">{evt.type.replace(/_/g, ' ').toLowerCase()}</p>
                        {ref && <p className="text-xs text-gray-500 font-mono">{ref as string}</p>}
                        {!!d.title && <p className="text-xs text-gray-600">{d.title as string}</p>}
                        {!!d.content && <p className="text-xs text-gray-600 mt-0.5">{d.content as string}</p>}
                        {amount != null && <p className="text-xs text-gray-500">{fmtNGN(Number(amount))}</p>}
                      </div>
                      <p className="text-xs text-gray-400 flex-shrink-0">{fmtDateTime(evt.date)}</p>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Orders ────────────────────────────────────────────────── */}
          {activeTab === 'Orders' && (
            ordersLoading
              ? <LoadingSkeleton rows={5} />
              : (ordersArr as never[]).length === 0
              ? <EmptyState icon={<ShoppingCart size={28} />} label="No orders" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 font-medium text-gray-600">Reference</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600">Channel</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600">Status</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600">Total</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600">Paid</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ordersArr as Record<string, unknown>[]).map((o) => (
                        <tr key={o.id as string} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-2">
                            <Link href={`/sales/orders/${o.id as string}`} className="text-blue-600 hover:underline font-mono text-xs">{o.reference as string}</Link>
                          </td>
                          <td className="py-2 px-2 text-xs text-gray-500">{o.channel as string}</td>
                          <td className="py-2 px-2">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs', STATUS_COLORS[o.status as string] ?? 'bg-gray-100 text-gray-600')}>{o.status as string}</span>
                          </td>
                          <td className="py-2 px-2 text-right">{fmtNGN(Number(o.totalAmount))}</td>
                          <td className="py-2 px-2 text-right text-green-600">{fmtNGN(Number(o.paidAmount))}</td>
                          <td className="py-2 px-2 text-right text-xs text-gray-400">{fmtDate(o.createdAt as string)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}

          {/* ── Invoices ──────────────────────────────────────────────── */}
          {activeTab === 'Invoices' && (
            (invoices?.data ?? []).length === 0
              ? <EmptyState icon={<FileText size={28} />} label="No invoices" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 font-medium text-gray-600">Reference</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600">Status</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600">Total</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600">Paid</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600">Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(invoices?.data as Record<string, unknown>[]).map((inv) => (
                        <tr key={inv.id as string} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-2">
                            <Link href={`/invoices/${inv.id as string}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.reference as string}</Link>
                          </td>
                          <td className="py-2 px-2">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs', STATUS_COLORS[inv.status as string] ?? 'bg-gray-100 text-gray-600')}>{inv.status as string}</span>
                          </td>
                          <td className="py-2 px-2 text-right">{fmtNGN(Number(inv.totalAmount))}</td>
                          <td className="py-2 px-2 text-right text-green-600">{fmtNGN(Number(inv.paidAmount))}</td>
                          <td className="py-2 px-2 text-right text-xs text-gray-400">{fmtDate(inv.dueDate as string)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}

          {/* ── Receipts ──────────────────────────────────────────────── */}
          {activeTab === 'Receipts' && (
            (receipts?.data ?? []).length === 0
              ? <EmptyState icon={<Receipt size={28} />} label="No receipts" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 font-medium text-gray-600">Reference</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600">Method</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600">Amount</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600">Date</th>
                        <th className="py-2 px-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(receipts?.data as Record<string, unknown>[]).map((r) => (
                        <tr key={r.id as string} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-2 font-mono text-xs text-gray-600">{r.reference as string}</td>
                          <td className="py-2 px-2 text-xs text-gray-500">{r.method as string}</td>
                          <td className="py-2 px-2 text-right text-green-600">{fmtNGN(Number(r.amount))}</td>
                          <td className="py-2 px-2 text-right text-xs text-gray-400">{fmtDate(r.issuedAt as string)}</td>
                          <td className="py-2 px-2 text-right">
                            <button onClick={() => void downloadReceiptPdf(r.id as string)} className="text-blue-500 hover:underline text-xs">PDF</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}

          {/* ── Notes ─────────────────────────────────────────────────── */}
          {activeTab === 'Notes' && (
            <div className="space-y-4">
              {/* Add note */}
              <div className="space-y-2">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note about this customer..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  maxLength={2000}
                />
                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-400">{noteText.length}/2000</p>
                  <button
                    onClick={() => noteText.trim() && addNote.mutate(noteText.trim())}
                    disabled={!noteText.trim() || addNote.isPending}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    <MessageSquare size={13} className="inline mr-1" />
                    Add Note
                  </button>
                </div>
              </div>

              {notesLoading
                ? <LoadingSkeleton rows={3} />
                : (notes?.data ?? []).length === 0
                ? <p className="text-sm text-gray-400 text-center py-4">No notes yet</p>
                : (notes?.data ?? []).map((note) => (
                  <div key={note.id} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-400">{fmtDateTime(note.createdAt)}</p>
                      <button
                        onClick={() => { if (confirm('Delete this note?')) deleteNote.mutate(note.id); }}
                        className="text-red-400 hover:text-red-600 text-xs flex items-center gap-0.5"
                      >
                        <Trash2 size={11} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {/* ── Follow-ups ────────────────────────────────────────────── */}
          {activeTab === 'Follow-ups' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Link
                  href={`/tasks/new?customerId=${customer.id}&customerName=${encodeURIComponent(`${customer.firstName} ${customer.lastName}`)}`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
                >
                  <Plus size={14} />
                  New Follow-up Task
                </Link>
              </div>
              {(tasks as { data: Record<string, unknown>[] } | undefined)?.data?.length === 0
                ? <EmptyState icon={<CheckSquare size={28} />} label="No follow-up tasks" />
                : ((tasks as { data: Record<string, unknown>[] } | undefined)?.data ?? []).map((task) => (
                  <Link key={task.id as string} href={`/tasks/${task.id as string}`} className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium mt-0.5', { URGENT: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700', MEDIUM: 'bg-amber-100 text-amber-700', LOW: 'bg-gray-100 text-gray-500' }[task.priority as string] ?? 'bg-gray-100 text-gray-500')}>
                      {task.priority as string}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{task.title as string}</p>
                      {!!task.dueDate && <p className="text-xs text-gray-400 mt-0.5">Due {fmtDate(task.dueDate as string)}</p>}
                    </div>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs', STATUS_COLORS[task.status as string] ?? 'bg-gray-100 text-gray-600')}>
                      {task.status as string}
                    </span>
                  </Link>
                ))
              }
            </div>
          )}

          {/* ── Statement ─────────────────────────────────────────────── */}
          {activeTab === 'Statement' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input type="date" value={stmtStart} onChange={(e) => setStmtStart(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input type="date" value={stmtEnd} onChange={(e) => setStmtEnd(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button
                  onClick={() => void downloadStatementPdf()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <Download size={14} />
                  Download PDF
                </button>
              </div>

              {stmtLoading
                ? <LoadingSkeleton rows={4} />
                : statement && (
                  <div className="space-y-4">
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Billed', value: fmtNGN((statement as { data: { summary: { totalBilled: number } } }).data.summary.totalBilled) },
                        { label: 'Paid', value: fmtNGN((statement as { data: { summary: { totalPaid: number } } }).data.summary.totalPaid) },
                        { label: 'Refunds', value: fmtNGN((statement as { data: { summary: { totalRefunded: number } } }).data.summary.totalRefunded) },
                        { label: 'Balance', value: fmtNGN((statement as { data: { summary: { outstandingBalance: number } } }).data.summary.outstandingBalance), red: (statement as { data: { summary: { outstandingBalance: number } } }).data.summary.outstandingBalance > 0 },
                      ].map(({ label, value, red }) => (
                        <div key={label} className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className={cn('text-lg font-bold', red ? 'text-red-600' : 'text-gray-900')}>{value}</p>
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-gray-400 italic">
                      {(statement as { data: { note: string } }).data.note}
                    </p>
                  </div>
                )
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small components ───────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <span className="text-gray-500 flex-shrink-0 min-w-[100px]">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="py-10 text-center text-gray-400">
      <div className="mx-auto mb-2 opacity-40">{icon}</div>
      <p className="text-sm">{label}</p>
    </div>
  );
}
