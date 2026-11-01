'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  CheckSquare,
  Users,
  FileText,
  Package,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  data: {
    kpis: {
      todayRevenue: number;
      activeOrders: number;
      lowStockCount: number;
      openTasks: number;
      pendingPOs: number;
      overdueInvoices: number;
      newCustomersThisMonth: number;
      customersWithOutstanding: number;
      monthRevenue: number;
      monthVsPrevPercent: number | null;
    };
    recentSales: Array<{
      id: string;
      reference: string;
      status: string;
      channel: string;
      totalAmount: number;
      paidAmount: number;
      createdAt: string;
      customer: { id: string; firstName: string; lastName: string } | null;
      _count: { items: number };
    }>;
    recentTasks: Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      dueDate: string | null;
      assignee: { id: string; firstName: string; lastName: string } | null;
      customer: { id: string; firstName: string; lastName: string } | null;
    }>;
    needsAttention: Array<{ type: string; label: string; count: number; link: string }>;
    lowStockItems: Array<{
      id: string;
      quantity: number;
      reorderPoint: number;
      product: { id: string; name: string; sku: string };
      location: { id: string; name: string };
    }>;
    pendingPOItems: Array<{
      id: string;
      reference: string;
      status: string;
      expectedDate: string | null;
      totalAmount: string;
      supplier: { id: string; name: string };
    }>;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNGN(val: number) {
  return val.toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
}

function fmtDate(val: string) {
  return new Date(val).toLocaleDateString('en-GB');
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'text-red-600 bg-red-50',
  HIGH: 'text-orange-600 bg-orange-50',
  MEDIUM: 'text-amber-600 bg-amber-50',
  LOW: 'text-gray-500 bg-gray-50',
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-amber-100 text-amber-700',
  DRAFT: 'bg-gray-100 text-gray-600',
};

// ── Stat Card ─────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color: string;
  trend?: { value: string; positive: boolean } | null;
  loading?: boolean;
  href?: string;
}

function StatCard({ title, value, subtitle, icon: Icon, color, trend, loading, href }: StatCardProps) {
  const inner = (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', color)}>
          <Icon size={18} className="text-white" />
        </div>
        {trend && (
          <span className={cn('text-xs font-medium flex items-center gap-0.5', trend.positive ? 'text-green-600' : 'text-red-500')}>
            {trend.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend.value}
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-7 bg-gray-100 rounded animate-pulse w-28" />
          <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle ?? title}</p>
        </>
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ── Quick Actions ─────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'New Sale', href: '/sales/new', icon: Plus, color: 'bg-blue-600' },
  { label: 'New Invoice', href: '/invoices/new', icon: FileText, color: 'bg-green-600' },
  { label: 'Receive Stock', href: '/purchasing/receive', icon: Package, color: 'bg-amber-600' },
  { label: 'Add Customer', href: '/customers/new', icon: Users, color: 'bg-purple-600' },
];

// ── Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api().get<DashboardData>('/dashboard');
      return res.data;
    },
    staleTime: 60 * 1000,
  });

  const kpis = data?.data.kpis;
  const recentSales = data?.data.recentSales ?? [];
  const recentTasks = data?.data.recentTasks ?? [];
  const needsAttention = data?.data.needsAttention ?? [];
  const lowStockItems = data?.data.lowStockItems ?? [];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const monthTrend =
    kpis?.monthVsPrevPercent !== null && kpis?.monthVsPrevPercent !== undefined
      ? { value: `${Math.abs(kpis.monthVsPrevPercent)}% vs last month`, positive: kpis.monthVsPrevPercent >= 0 }
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}{user?.firstName ? `, ${user.firstName}` : ''}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Here is what is happening with your business today.</p>
      </div>

      {/* KPI row 1 — revenue + orders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Today Revenue"
          value={isLoading ? '—' : fmtNGN(kpis?.todayRevenue ?? 0)}
          subtitle="Payments received today"
          icon={TrendingUp}
          color="bg-green-500"
          loading={isLoading}
        />
        <StatCard
          title="Month Revenue"
          value={isLoading ? '—' : fmtNGN(kpis?.monthRevenue ?? 0)}
          subtitle="This calendar month"
          icon={TrendingUp}
          color="bg-emerald-600"
          trend={monthTrend}
          loading={isLoading}
        />
        <StatCard
          title="Active Orders"
          value={kpis?.activeOrders ?? 0}
          subtitle="Confirmed / processing"
          icon={ShoppingCart}
          color="bg-blue-500"
          loading={isLoading}
          href="/sales/orders?status=CONFIRMED"
        />
        <StatCard
          title="Open Tasks"
          value={kpis?.openTasks ?? 0}
          subtitle="Todo + in progress"
          icon={CheckSquare}
          color="bg-purple-500"
          loading={isLoading}
          href="/tasks?status=TODO"
        />
      </div>

      {/* KPI row 2 — attention items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Low Stock Items"
          value={kpis?.lowStockCount ?? 0}
          subtitle="At or below reorder point"
          icon={AlertTriangle}
          color="bg-amber-500"
          loading={isLoading}
          href="/reports/inventory?view=low-stock"
        />
        <StatCard
          title="Pending POs"
          value={kpis?.pendingPOs ?? 0}
          subtitle="Purchase orders pending"
          icon={Package}
          color="bg-orange-500"
          loading={isLoading}
          href="/purchasing/orders?status=SUBMITTED"
        />
        <StatCard
          title="Overdue Invoices"
          value={kpis?.overdueInvoices ?? 0}
          subtitle="Past due date"
          icon={FileText}
          color="bg-red-500"
          loading={isLoading}
          href="/invoices?status=OVERDUE"
        />
        <StatCard
          title="New Customers"
          value={kpis?.newCustomersThisMonth ?? 0}
          subtitle="Joined this month"
          icon={Users}
          color="bg-indigo-500"
          loading={isLoading}
          href="/customers"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', action.color)}>
                <action.icon size={18} className="text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Needs Attention */}
      {(needsAttention.length > 0 || isLoading) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} />
            Needs Attention
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-8 bg-amber-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {needsAttention.map((item) => (
                <Link
                  key={item.type}
                  href={item.link}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm hover:border-amber-400 hover:shadow-sm transition-all"
                >
                  <span className="font-bold text-amber-700">{item.count}</span>
                  <span className="text-gray-700">{item.label}</span>
                  <ArrowUpRight size={12} className="text-gray-400" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Recent Sales</h3>
            <Link href="/sales/orders" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 flex gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 bg-gray-100 rounded animate-pulse w-32" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-20" />
                    </div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-16" />
                  </div>
                ))
              : recentSales.length === 0
              ? (
                <div className="py-10 text-center text-gray-400">
                  <ShoppingCart size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No recent sales</p>
                </div>
              )
              : recentSales.map((order) => (
                <Link
                  key={order.id}
                  href={`/sales/orders/${order.id}`}
                  className="flex items-center px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {order.customer
                        ? `${order.customer.firstName} ${order.customer.lastName}`
                        : 'Walk-in'}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">{order.reference}</p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{fmtNGN(order.totalAmount)}</p>
                    <p className="text-xs text-gray-400">{fmtDate(order.createdAt)}</p>
                  </div>
                  <span className={cn('ml-3 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600')}>
                    {order.status}
                  </span>
                </Link>
              ))
            }
          </div>
        </div>

        {/* Right column — tasks + low stock */}
        <div className="space-y-6">
          {/* Open Tasks */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Open Tasks</h3>
              <Link href="/tasks" className="text-xs text-blue-600 hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="px-5 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse w-48 mb-1.5" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
                    </div>
                  ))
                : recentTasks.length === 0
                ? (
                  <div className="py-8 text-center text-gray-400">
                    <CheckSquare size={24} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No open tasks</p>
                  </div>
                )
                : recentTasks.slice(0, 5).map((task) => {
                  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                  return (
                    <Link
                      key={task.id}
                      href={`/tasks/${task.id}`}
                      className="flex items-start px-5 py-3 hover:bg-gray-50 transition-colors gap-3"
                    >
                      <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium mt-0.5 flex-shrink-0', PRIORITY_COLORS[task.priority] ?? 'text-gray-500 bg-gray-50')}>
                        {task.priority}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{task.title}</p>
                        {task.customer && (
                          <p className="text-xs text-blue-600 truncate">
                            {task.customer.firstName} {task.customer.lastName}
                          </p>
                        )}
                        {task.dueDate && (
                          <p className={cn('text-xs flex items-center gap-1', isOverdue ? 'text-red-500' : 'text-gray-400')}>
                            <Clock size={10} />
                            {fmtDate(task.dueDate)}
                            {isOverdue && ' — overdue'}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })
              }
            </div>
          </div>

          {/* Low Stock items */}
          {(lowStockItems.length > 0 || isLoading) && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500" />
                  Low Stock
                </h3>
                <Link href="/reports/inventory?view=low-stock" className="text-xs text-blue-600 hover:underline">Manage</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="px-5 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-40 mb-1" />
                        <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
                      </div>
                    ))
                  : lowStockItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                        <p className="text-xs text-gray-400">{item.location.name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-red-600">{item.quantity}</p>
                        <p className="text-xs text-gray-400">/ {item.reorderPoint} min</p>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
