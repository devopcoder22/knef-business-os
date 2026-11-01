'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingCart,
  Users,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lightbulb,
  FlaskConical,
  MessageSquare,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Minus,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PeriodComparison {
  current: number;
  previous: number;
  change: number;
  changePercent: number | null;
}

interface ExecutiveSnapshot {
  generatedAt: string;
  salesToday: number;
  salesThisWeek: number;
  salesThisMonth: number;
  ordersThisMonth: number;
  avgOrderValue: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingPurchaseOrders: number;
  pendingPurchaseOrderValue: number;
  unpaidInvoicesCount: number;
  unpaidInvoicesValue: number;
  expensesThisMonth: number;
  overdueTasks: number;
  activeGoals: number;
  goalsOnTrack: number;
  goalsAtRisk: number;
  newCustomersThisMonth: number;
  activeCustomersThisMonth: number;
  _label: 'FACT';
}

interface SalesIntelligence {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgOrderValue: number;
  revenueComparison: PeriodComparison;
  ordersComparison: PeriodComparison;
  topProducts: { productId: string; name: string; revenue: number; quantitySold: number; grossProfit: number }[];
  byCategory: { categoryId: string | null; categoryName: string; revenue: number; quantity: number }[];
  dailyTrend: { date: string; revenue: number; orders: number }[];
  _label: 'FACT';
}

interface InventoryIntelligence {
  totalStockValue: number;
  totalProducts: number;
  lowStockItems: { productId: string; name: string; currentStock: number; lowStockAlert: number }[];
  outOfStockItems: { productId: string; name: string }[];
  fastMovers: { productId: string; name: string; unitsSold30Days: number; currentStock: number; daysOfStockRemaining: number | null }[];
  slowMovers: { productId: string; name: string; unitsSold30Days: number; currentStock: number }[];
  _label: 'FACT';
}

interface Recommendation {
  id: string;
  type: string;
  title: string;
  _label: 'RECOMMENDATION';
  supportingFacts: string[];
  reasoning: string;
  expectedBenefit: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  entityName?: string;
}

interface SimulationResult {
  scenario: string;
  _label: 'SIMULATION';
  WARNING: string;
  baseline: Record<string, number | string>;
  assumptions: string[];
  simulatedInputs: Record<string, number | string>;
  calculatedOutcome: Record<string, number | string>;
  differences: Record<string, number | string>;
  caveats: string[];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat('en-NG').format(n);
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-gray-400">N/A</span>;
  const pos = pct >= 0;
  return (
    <span className={cn('flex items-center gap-0.5 text-xs font-medium', pos ? 'text-emerald-600' : 'text-red-600')}>
      {pos ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconBg)}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
        {badge}
      </div>
    </div>
  );
}

// ─── Section Label Badge ──────────────────────────────────────────────────────

function LabelBadge({ label }: { label: string }) {
  const colors: Record<string, string> = {
    FACT: 'bg-blue-100 text-blue-700',
    ANALYSIS: 'bg-purple-100 text-purple-700',
    FORECAST: 'bg-amber-100 text-amber-700',
    RECOMMENDATION: 'bg-emerald-100 text-emerald-700',
    SIMULATION: 'bg-red-100 text-red-700',
  };
  return (
    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded', colors[label] ?? 'bg-gray-100 text-gray-600')}>
      {label}
    </span>
  );
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'sales', label: 'Sales', icon: ShoppingCart },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
  { id: 'simulation', label: 'Simulation', icon: FlaskConical },
  { id: 'ask', label: 'Ask AI', icon: MessageSquare },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BusinessIntelligencePage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Business Intelligence</h1>
        <p className="text-sm text-gray-500 mt-1">
          Fact-based management insights powered by your actual business data.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'sales' && <SalesTab />}
      {activeTab === 'inventory' && <InventoryTab />}
      {activeTab === 'customers' && <CustomersTab />}
      {activeTab === 'recommendations' && <RecommendationsTab />}
      {activeTab === 'simulation' && <SimulationTab />}
      {activeTab === 'ask' && <AskAiTab />}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data, isLoading, refetch } = useQuery<{ snapshot: ExecutiveSnapshot; narrative: string | null }>({
    queryKey: ['bi-overview'],
    queryFn: () => api().get('/business-intelligence/overview').then((r) => r.data.data ?? r.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSpinner />;

  const s = data?.snapshot;
  if (!s) return <EmptyState message="Could not load executive snapshot." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Executive Snapshot</h2>
          <LabelBadge label="FACT" />
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* AI Narrative */}
      {data?.narrative && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={14} className="text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">AI ANALYSIS</span>
          </div>
          <p className="text-sm text-blue-900">{data.narrative}</p>
        </div>
      )}

      {/* Sales KPIs */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sales</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Today" value={fmt(s.salesToday)} icon={TrendingUp} iconBg="bg-blue-50 text-blue-600" />
          <KpiCard label="This Week" value={fmt(s.salesThisWeek)} icon={TrendingUp} iconBg="bg-indigo-50 text-indigo-600" />
          <KpiCard label="This Month" value={fmt(s.salesThisMonth)} icon={TrendingUp} iconBg="bg-purple-50 text-purple-600" sub={`${fmtNum(s.ordersThisMonth)} orders`} />
          <KpiCard label="Avg Order Value" value={fmt(s.avgOrderValue)} icon={ShoppingCart} iconBg="bg-emerald-50 text-emerald-600" />
        </div>
      </div>

      {/* Inventory & Finance */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Inventory & Finance</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Stock Value" value={fmt(s.inventoryValue)} icon={Package} iconBg="bg-amber-50 text-amber-600" />
          <KpiCard
            label="Low Stock"
            value={fmtNum(s.lowStockCount)}
            icon={AlertTriangle}
            iconBg={s.lowStockCount > 0 ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-400'}
            sub={`${s.outOfStockCount} out of stock`}
          />
          <KpiCard label="Pending POs" value={fmtNum(s.pendingPurchaseOrders)} icon={Package} iconBg="bg-cyan-50 text-cyan-600" sub={fmt(s.pendingPurchaseOrderValue)} />
          <KpiCard label="Unpaid Invoices" value={fmtNum(s.unpaidInvoicesCount)} icon={AlertTriangle} iconBg="bg-red-50 text-red-500" sub={fmt(s.unpaidInvoicesValue)} />
        </div>
      </div>

      {/* Operations */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Operations</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Overdue Tasks" value={fmtNum(s.overdueTasks)} icon={Clock} iconBg={s.overdueTasks > 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'} />
          <KpiCard label="Active Goals" value={fmtNum(s.activeGoals)} icon={Target} iconBg="bg-purple-50 text-purple-600" sub={`${s.goalsOnTrack} on track, ${s.goalsAtRisk} at risk`} />
          <KpiCard label="New Customers" value={fmtNum(s.newCustomersThisMonth)} icon={Users} iconBg="bg-teal-50 text-teal-600" sub="this month" />
          <KpiCard label="Active Customers" value={fmtNum(s.activeCustomersThisMonth)} icon={Users} iconBg="bg-sky-50 text-sky-600" sub="with orders this month" />
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Data generated at {s.generatedAt ? new Date(s.generatedAt).toLocaleString() : '—'} · All figures are facts from the database.
      </p>
    </div>
  );
}

// ─── Sales Tab ────────────────────────────────────────────────────────────────

function SalesTab() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);

  const { data, isLoading } = useQuery<SalesIntelligence>({
    queryKey: ['bi-sales', startDate, endDate],
    queryFn: () =>
      api()
        .get(`/business-intelligence/sales?startDate=${startDate}&endDate=${endDate}`)
        .then((r) => r.data.data ?? r.data),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Sales Intelligence</h2>
          <LabelBadge label="FACT" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-gray-400">to</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
        </div>
      </div>

      {isLoading && <LoadingSpinner />}

      {data && (
        <>
          {/* KPIs with comparison */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Revenue"
              value={fmt(data.totalRevenue)}
              icon={TrendingUp}
              iconBg="bg-blue-50 text-blue-600"
              badge={<ChangeBadge pct={data.revenueComparison.changePercent} />}
            />
            <KpiCard
              label="Orders"
              value={fmtNum(data.totalOrders)}
              icon={ShoppingCart}
              iconBg="bg-purple-50 text-purple-600"
              badge={<ChangeBadge pct={data.ordersComparison.changePercent} />}
            />
            <KpiCard label="Completed" value={fmtNum(data.completedOrders)} icon={CheckCircle2} iconBg="bg-emerald-50 text-emerald-600" />
            <KpiCard label="Avg Order" value={fmt(data.avgOrderValue)} icon={ShoppingCart} iconBg="bg-amber-50 text-amber-600" />
          </div>

          {/* Daily Revenue Trend */}
          {data.dailyTrend.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.dailyTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Products */}
          {data.topProducts.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Products by Revenue</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2">Product</th>
                      <th className="pb-2 text-right">Units Sold</th>
                      <th className="pb-2 text-right">Revenue</th>
                      <th className="pb-2 text-right">Gross Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.productId} className="border-b last:border-0">
                        <td className="py-2 font-medium">{p.name}</td>
                        <td className="py-2 text-right text-gray-600">{fmtNum(p.quantitySold)}</td>
                        <td className="py-2 text-right font-medium">{fmt(p.revenue)}</td>
                        <td className={cn('py-2 text-right', p.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                          {fmt(p.grossProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Category */}
          {data.byCategory.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Category</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.byCategory.slice(0, 8)}>
                  <XAxis dataKey="categoryName" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <ComparisonBlock label="Revenue" comp={data.revenueComparison} fmt={fmt} />
        </>
      )}
    </div>
  );
}

function ComparisonBlock({ label, comp, fmt: fmtFn }: { label: string; comp: PeriodComparison; fmt: (n: number) => string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-gray-500">PERIOD COMPARISON — {label.toUpperCase()}</span>
        <LabelBadge label="FACT" />
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-gray-400">Current Period</p>
          <p className="font-bold">{fmtFn(comp.current)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Previous Period</p>
          <p className="font-bold">{fmtFn(comp.previous)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Change</p>
          <p className={cn('font-bold', comp.change >= 0 ? 'text-emerald-600' : 'text-red-500')}>
            {comp.change >= 0 ? '+' : ''}{fmtFn(comp.change)}
          </p>
          <ChangeBadge pct={comp.changePercent} />
        </div>
      </div>
    </div>
  );
}

// ─── Inventory Tab ────────────────────────────────────────────────────────────

function InventoryTab() {
  const { data, isLoading } = useQuery<InventoryIntelligence>({
    queryKey: ['bi-inventory'],
    queryFn: () => api().get('/business-intelligence/inventory').then((r) => r.data.data ?? r.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSpinner />;
  if (!data) return <EmptyState message="No inventory data." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Inventory Intelligence</h2>
        <LabelBadge label="FACT" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Stock Value" value={fmt(data.totalStockValue)} icon={Package} iconBg="bg-blue-50 text-blue-600" />
        <KpiCard label="Low Stock" value={fmtNum(data.lowStockItems.length)} icon={AlertTriangle} iconBg="bg-orange-50 text-orange-500" />
        <KpiCard label="Out of Stock" value={fmtNum(data.outOfStockItems.length)} icon={AlertTriangle} iconBg="bg-red-50 text-red-500" />
      </div>

      {data.outOfStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} /> Out of Stock ({data.outOfStockItems.length})
          </h3>
          <div className="space-y-1">
            {data.outOfStockItems.map((item) => (
              <div key={item.productId} className="flex items-center justify-between text-sm">
                <span className="text-red-900 font-medium">{item.name}</span>
                <span className="text-red-600 text-xs">OUT OF STOCK</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.lowStockItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-orange-500" /> Low Stock Items
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b">
                <th className="pb-2">Product</th>
                <th className="pb-2 text-right">Stock</th>
                <th className="pb-2 text-right">Alert Level</th>
              </tr>
            </thead>
            <tbody>
              {data.lowStockItems.map((item) => (
                <tr key={item.productId} className="border-b last:border-0">
                  <td className="py-2">{item.name}</td>
                  <td className="py-2 text-right text-orange-600 font-medium">{item.currentStock}</td>
                  <td className="py-2 text-right text-gray-400">{item.lowStockAlert}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.fastMovers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-500" /> Fast Movers (30 days)
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b">
                <th className="pb-2">Product</th>
                <th className="pb-2 text-right">Units Sold</th>
                <th className="pb-2 text-right">Stock</th>
                <th className="pb-2 text-right">Days Left</th>
              </tr>
            </thead>
            <tbody>
              {data.fastMovers.map((item) => (
                <tr key={item.productId} className="border-b last:border-0">
                  <td className="py-2 font-medium">{item.name}</td>
                  <td className="py-2 text-right">{item.unitsSold30Days}</td>
                  <td className="py-2 text-right">{item.currentStock}</td>
                  <td className={cn('py-2 text-right font-medium', item.daysOfStockRemaining !== null && item.daysOfStockRemaining < 14 ? 'text-red-500' : 'text-gray-700')}>
                    {item.daysOfStockRemaining !== null ? `${item.daysOfStockRemaining}d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Customers Tab ────────────────────────────────────────────────────────────

function CustomersTab() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const { data, isLoading } = useQuery<{
    totalCustomers: number;
    newThisPeriod: number;
    activeThisPeriod: number;
    repeatCustomers: number;
    inactiveCustomers: number;
    topCustomers: { customerId: string; firstName: string; lastName: string; orderCount: number; totalSpent: number; segment: string }[];
    _label: string;
  }>({
    queryKey: ['bi-customers'],
    queryFn: () =>
      api()
        .get(`/business-intelligence/customers?startDate=${monthStart}&endDate=${today}`)
        .then((r) => r.data.data ?? r.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSpinner />;
  if (!data) return <EmptyState message="No customer data." />;

  const segmentColors: Record<string, string> = {
    HIGH_VALUE: 'bg-purple-100 text-purple-700',
    REPEAT: 'bg-emerald-100 text-emerald-700',
    NEW: 'bg-blue-100 text-blue-700',
    AT_RISK: 'bg-amber-100 text-amber-700',
    INACTIVE: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Customer Intelligence</h2>
        <LabelBadge label="FACT" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Customers" value={fmtNum(data.totalCustomers)} icon={Users} iconBg="bg-blue-50 text-blue-600" />
        <KpiCard label="New This Month" value={fmtNum(data.newThisPeriod)} icon={Users} iconBg="bg-emerald-50 text-emerald-600" />
        <KpiCard label="Active This Month" value={fmtNum(data.activeThisPeriod)} icon={Users} iconBg="bg-purple-50 text-purple-600" />
        <KpiCard label="Inactive (90d)" value={fmtNum(data.inactiveCustomers)} icon={Clock} iconBg="bg-orange-50 text-orange-500" />
      </div>

      {data.topCustomers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Customers</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b">
                <th className="pb-2">Customer</th>
                <th className="pb-2 text-right">Orders</th>
                <th className="pb-2 text-right">Total Spent</th>
                <th className="pb-2">Segment</th>
              </tr>
            </thead>
            <tbody>
              {data.topCustomers.map((c) => (
                <tr key={c.customerId} className="border-b last:border-0">
                  <td className="py-2 font-medium">{c.firstName} {c.lastName}</td>
                  <td className="py-2 text-right text-gray-600">{c.orderCount}</td>
                  <td className="py-2 text-right font-medium">{fmt(c.totalSpent)}</td>
                  <td className="py-2">
                    <span className={cn('text-xs px-2 py-0.5 rounded font-medium', segmentColors[c.segment] ?? 'bg-gray-100 text-gray-600')}>
                      {c.segment}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">Segments: HIGH_VALUE ≥ ₦100,000 spent · REPEAT &gt;1 orders · INACTIVE 90+ days without orders.</p>
        </div>
      )}
    </div>
  );
}

// ─── Recommendations Tab ──────────────────────────────────────────────────────

function RecommendationsTab() {
  const { data, isLoading } = useQuery<Recommendation[]>({
    queryKey: ['bi-recommendations'],
    queryFn: () => api().get('/business-intelligence/recommendations').then((r) => r.data.data ?? r.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSpinner />;

  const recs = Array.isArray(data) ? data : [];

  const urgencyBg: Record<string, string> = {
    HIGH: 'border-red-200 bg-red-50',
    MEDIUM: 'border-amber-200 bg-amber-50',
    LOW: 'border-gray-200 bg-white',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Recommendations</h2>
        <LabelBadge label="RECOMMENDATION" />
      </div>
      <p className="text-sm text-gray-500">
        All recommendations are advisory and based on factual business data. Actions must be taken through the appropriate business workflows.
      </p>

      {recs.length === 0 && <EmptyState message="No recommendations at this time. Business looks healthy!" />}

      {recs.map((rec) => (
        <div key={rec.id} className={cn('border rounded-xl p-5', urgencyBg[rec.urgency])}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Lightbulb size={16} className="text-amber-500 flex-shrink-0" />
              <span className="font-semibold text-gray-900">{rec.title}</span>
              <span className={cn(
                'text-xs px-2 py-0.5 rounded font-semibold',
                rec.urgency === 'HIGH' ? 'bg-red-200 text-red-800' : rec.urgency === 'MEDIUM' ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-600',
              )}>
                {rec.urgency}
              </span>
            </div>
            <LabelBadge label="RECOMMENDATION" />
          </div>
          <p className="text-sm text-gray-700 mb-3">{rec.reasoning}</p>
          <div className="bg-white/60 rounded-lg p-3 mb-3">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">SUPPORTING FACTS</p>
            <ul className="space-y-0.5">
              {rec.supportingFacts.map((fact, i) => (
                <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                  <ChevronRight size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-emerald-700 font-medium">{rec.expectedBenefit}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Simulation Tab ───────────────────────────────────────────────────────────

function SimulationTab() {
  const [scenario, setScenario] = useState<'SALES_CHANGE' | 'MARGIN_CHANGE' | 'EXPENSE_CHANGE' | 'DEMAND_CHANGE'>('SALES_CHANGE');
  const [changePercent, setChangePercent] = useState('10');
  const [windowDays, setWindowDays] = useState('30');

  const mutation = useMutation<SimulationResult>({
    mutationFn: () =>
      api()
        .post('/business-intelligence/simulate', {
          scenario,
          baselinePeriodDays: parseInt(windowDays) || 30,
          parameters: { changePercent: parseFloat(changePercent) || 0, marginChangePoints: parseFloat(changePercent) || 0, demandChangePercent: parseFloat(changePercent) || 0 },
        })
        .then((r) => r.data.data ?? r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">What-If Simulation</h2>
        <LabelBadge label="SIMULATION" />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-800 font-medium">
          Simulations are read-only calculations. No business records are created or modified.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scenario</label>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value as typeof scenario)}
            className="border rounded-lg px-3 py-2 w-full text-sm"
          >
            <option value="SALES_CHANGE">Sales Volume Change</option>
            <option value="MARGIN_CHANGE">Gross Margin Change</option>
            <option value="EXPENSE_CHANGE">Expense Change</option>
            <option value="DEMAND_CHANGE">Demand Change (Inventory Impact)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Change % (or points)</label>
            <input
              type="number"
              value={changePercent}
              onChange={(e) => setChangePercent(e.target.value)}
              className="border rounded-lg px-3 py-2 w-full text-sm"
              placeholder="e.g. 10 or -5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Baseline Window (days)</label>
            <input
              type="number"
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
              className="border rounded-lg px-3 py-2 w-full text-sm"
              min="1"
              max="365"
            />
          </div>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Running...' : 'Run Simulation'}
        </button>
      </div>

      {mutation.data && (
        <div className="bg-white border-2 border-amber-400 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical size={16} className="text-amber-600" />
            <span className="font-bold text-amber-800">{mutation.data.WARNING}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">BASELINE (FACT)</p>
              {Object.entries(mutation.data.baseline).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-600 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-700 mb-2">SIMULATED OUTCOME</p>
              {Object.entries(mutation.data.calculatedOutcome).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-amber-800 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="font-bold">{String(v)}</span>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 mb-2">DIFFERENCES</p>
              {Object.entries(mutation.data.differences).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-blue-800 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  <span className={cn('font-bold', Number(v) >= 0 ? 'text-emerald-700' : 'text-red-600')}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">ASSUMPTIONS</p>
            <ul className="space-y-0.5">
              {mutation.data.assumptions.map((a, i) => (
                <li key={i} className="text-xs text-gray-600">• {a}</li>
              ))}
            </ul>
          </div>

          <div className="bg-amber-100 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">CAVEATS</p>
            {mutation.data.caveats.map((c, i) => (
              <p key={i} className="text-xs text-amber-800">• {c}</p>
            ))}
          </div>
        </div>
      )}

      {mutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Simulation failed. Check parameters and try again.
        </div>
      )}
    </div>
  );
}

// ─── Ask AI Tab ───────────────────────────────────────────────────────────────

function AskAiTab() {
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading, refetch } = useQuery<{ answer: string; dataUsed: string[]; _label: string; disclaimer: string }>({
    queryKey: ['bi-ask', submitted],
    queryFn: () =>
      api()
        .post('/business-intelligence/ask', { question: submitted })
        .then((r) => r.data.data ?? r.data),
    enabled: !!submitted,
    staleTime: 0,
  });

  const handleAsk = () => {
    if (!question.trim()) return;
    setSubmitted(question.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Ask a Business Question</h2>
        <LabelBadge label="ANALYSIS" />
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        AI answers are based on pre-calculated metrics from your database — not invented numbers. All answers are advisory only.
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <label className="block text-sm font-medium text-gray-700">Your question (max 500 characters)</label>
        <textarea
          rows={3}
          maxLength={500}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="border rounded-lg px-3 py-2 w-full text-sm resize-none"
          placeholder="e.g. What should I focus on this week? Why is inventory low? How are sales trending?"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{question.length}/500</span>
          <button
            onClick={handleAsk}
            disabled={!question.trim() || isLoading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? 'Thinking...' : 'Ask'}
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-400">SUGGESTED QUESTIONS</p>
          {[
            'What is happening in my business right now?',
            'What should I do next?',
            'Which products need attention?',
            'How are my goals progressing?',
          ].map((q) => (
            <button
              key={q}
              onClick={() => setQuestion(q)}
              className="block text-left text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              → {q}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-purple-600" />
            <LabelBadge label="ANALYSIS" />
          </div>
          <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{data.answer}</p>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">{data.disclaimer}</p>
          </div>
          {data.dataUsed?.length > 0 && (
            <p className="text-xs text-gray-400">Data used: {data.dataUsed.join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Utility Components ───────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Minus size={32} className="mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
