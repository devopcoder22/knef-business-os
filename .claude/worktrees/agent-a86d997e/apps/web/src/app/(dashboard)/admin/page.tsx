'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Shield,
  Webhook,
  CheckSquare,
  Key,
  Flag,
  Database,
  ServerCrash,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';

interface OverviewData {
  users: { total: number; active: number };
  roles: number;
  agents: number;
  pendingApprovals: number;
  apiKeys: number;
  activeFeatureFlags: number;
}

interface HealthData {
  status: 'ok' | 'error';
  details: {
    database: { status: string };
    redis: { status: string };
  };
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === 'up' || status === 'ok';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
        ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Healthy' : 'Degraded'}
    </span>
  );
}

const QUICK_LINKS = [
  { label: 'Manage Users', href: '/admin/users', desc: 'Invite, activate, or deactivate users' },
  { label: 'Manage Roles', href: '/admin/roles', desc: 'Configure role permissions' },
  { label: 'Feature Flags', href: '/admin/feature-flags', desc: 'Toggle platform features' },
  { label: 'External Agents', href: '/admin/agents', desc: 'Manage API agent access' },
  { label: 'Pending Approvals', href: '/admin/approvals', desc: 'Review AI action requests' },
  { label: 'Audit Logs', href: '/admin/audit', desc: 'Track all system activity' },
];

export default function AdminOverviewPage() {
  const { data: overview, isLoading } = useQuery<OverviewData>({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      const res = await api().get<OverviewData>('/admin/overview');
      return res.data;
    },
  });

  const { data: health } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api().get<HealthData>('/health');
      return res.data;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Overview</h1>
        <p className="text-gray-500 text-sm mt-1">System status and quick access to admin tools</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Users"
              value={overview?.users.total ?? 0}
              icon={Users}
              color="bg-blue-50 text-blue-600"
            />
            <StatCard
              label="Active Users"
              value={overview?.users.active ?? 0}
              icon={Users}
              color="bg-green-50 text-green-600"
            />
            <StatCard
              label="Roles"
              value={overview?.roles ?? 0}
              icon={Shield}
              color="bg-purple-50 text-purple-600"
            />
            <StatCard
              label="External Agents"
              value={overview?.agents ?? 0}
              icon={Webhook}
              color="bg-indigo-50 text-indigo-600"
            />
            <StatCard
              label="Pending Approvals"
              value={overview?.pendingApprovals ?? 0}
              icon={CheckSquare}
              color="bg-amber-50 text-amber-600"
            />
            <StatCard
              label="API Keys"
              value={overview?.apiKeys ?? 0}
              icon={Key}
              color="bg-slate-50 text-slate-600"
            />
            <StatCard
              label="Active Flags"
              value={overview?.activeFeatureFlags ?? 0}
              icon={Flag}
              color="bg-pink-50 text-pink-600"
            />
          </>
        )}
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                  {link.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{link.desc}</p>
              </div>
              <ArrowRight size={14} className="text-gray-300 group-hover:text-blue-500 flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* System Health */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">System Health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
            <div className="flex items-center gap-2">
              <ServerCrash size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">API</span>
            </div>
            <StatusBadge status={health?.status ?? 'ok'} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Database</span>
            </div>
            <StatusBadge status={health?.details?.database?.status ?? 'unknown'} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Redis</span>
            </div>
            <StatusBadge status={health?.details?.redis?.status ?? 'unknown'} />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Health status refreshes every 30 seconds. Last checked now.
        </p>
      </div>
    </div>
  );
}
