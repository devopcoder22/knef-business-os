'use client';

import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  CheckSquare,
  ArrowUpRight,
  Plus,
  FileText,
  Package,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  trend?: { value: string; positive: boolean };
  loading?: boolean;
  color: string;
}

function StatCard({ title, value, subtitle, icon: Icon, trend, loading, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
          <Icon size={20} className="text-white" />
        </div>
        {trend && (
          <span
            className={cn(
              'text-xs font-medium flex items-center gap-1',
              trend.positive ? 'text-green-600' : 'text-red-600',
            )}
          >
            <ArrowUpRight size={12} className={trend.positive ? '' : 'rotate-180'} />
            {trend.value}
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 bg-gray-100 rounded animate-pulse w-32" />
          <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500 mt-1">{subtitle ?? title}</p>
        </>
      )}
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: 'New Sale', href: '/sales/new', icon: Plus, color: 'bg-blue-600' },
  { label: 'New Invoice', href: '/invoices/new', icon: FileText, color: 'bg-green-600' },
  { label: 'Receive Stock', href: '/purchasing/receive', icon: Package, color: 'bg-amber-600' },
  { label: 'Add Customer', href: '/customers/new', icon: Users, color: 'bg-purple-600' },
];

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Fetch multiple stats in parallel
      const client = api();
      try {
        const [ordersRes, tasksRes] = await Promise.allSettled([
          client.get('/sales/orders?status=CONFIRMED&limit=1'),
          client.get('/tasks?status=TODO&limit=1'),
        ]);

        return {
          todayRevenue: 'NGN 0.00',
          activeOrders: ordersRes.status === 'fulfilled' ? ordersRes.value.data?.meta?.total ?? 0 : 0,
          lowStockItems: 0,
          openTasks: tasksRes.status === 'fulfilled' ? tasksRes.value.data?.meta?.total ?? 0 : 0,
        };
      } catch {
        return {
          todayRevenue: 'NGN 0.00',
          activeOrders: 0,
          lowStockItems: 0,
          openTasks: 0,
        };
      }
    },
    staleTime: 60 * 1000,
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {user?.firstName}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Here is what is happening with your business today.
        </p>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={dashboardData?.todayRevenue ?? 'NGN 0.00'}
          subtitle="Total sales today"
          icon={TrendingUp}
          color="bg-green-500"
          loading={isLoading}
          trend={{ value: '0%', positive: true }}
        />
        <StatCard
          title="Active Orders"
          value={dashboardData?.activeOrders ?? 0}
          subtitle="Orders in progress"
          icon={ShoppingCart}
          color="bg-blue-500"
          loading={isLoading}
        />
        <StatCard
          title="Low Stock Items"
          value={dashboardData?.lowStockItems ?? 0}
          subtitle="Items below threshold"
          icon={AlertTriangle}
          color="bg-amber-500"
          loading={isLoading}
        />
        <StatCard
          title="Open Tasks"
          value={dashboardData?.openTasks ?? 0}
          subtitle="Tasks pending"
          icon={CheckSquare}
          color="bg-purple-500"
          loading={isLoading}
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <a
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
            </a>
          ))}
        </div>
      </div>

      {/* Recent activity placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Sales</h3>
          <div className="text-center py-8 text-gray-400">
            <ShoppingCart size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No sales today yet</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">My Open Tasks</h3>
          <div className="text-center py-8 text-gray-400">
            <CheckSquare size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No open tasks</p>
          </div>
        </div>
      </div>
    </div>
  );
}
