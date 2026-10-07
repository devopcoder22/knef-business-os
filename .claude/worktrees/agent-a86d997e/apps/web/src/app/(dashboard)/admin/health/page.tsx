'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Server, Users, Webhook, HardDrive } from 'lucide-react';
import { api } from '@/lib/api';

interface HealthData {
  status: 'ok' | 'error';
  details: {
    database: { status: string };
    redis: { status: string };
  };
}

interface OverviewData {
  users: { total: number; active: number };
  roles: number;
  agents: number;
  pendingApprovals: number;
  apiKeys: number;
  activeFeatureFlags: number;
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === 'up' || status === 'ok';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
        ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Healthy' : 'Degraded'}
    </span>
  );
}

function ServiceRow({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  status: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
          <Icon size={16} className="text-gray-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

export default function HealthPage() {
  const { data: health, isLoading: healthLoading, dataUpdatedAt } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api().get<HealthData>('/health');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      const res = await api().get<OverviewData>('/admin/overview');
      return res.data;
    },
  });

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : 'Loading...';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-gray-500 text-sm mt-1">Real-time status of all system components</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-blue-500 animate-pulse" />
            <span className="text-xs text-gray-500">Auto-refreshes every 30s</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Last checked: {lastChecked}</p>
        </div>
      </div>

      {/* Service Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Service Status</h2>
        {healthLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div>
            <ServiceRow
              icon={Server}
              label="API Server"
              status={health?.status ?? 'unknown'}
              detail="REST API endpoint"
            />
            <ServiceRow
              icon={Database}
              label="Database"
              status={health?.details?.database?.status ?? 'unknown'}
              detail="PostgreSQL primary"
            />
            <ServiceRow
              icon={Database}
              label="Redis"
              status={health?.details?.redis?.status ?? 'unknown'}
              detail="Cache & session store"
            />
            <ServiceRow
              icon={HardDrive}
              label="Backup"
              status="not_configured"
              detail="Automated backup not configured"
            />
          </div>
        )}
      </div>

      {/* System Counts */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">System Summary</h2>
        {overviewLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} className="text-gray-500" />
                <span className="text-xs text-gray-500">Users</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{overview?.users.total ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">{overview?.users.active ?? 0} active</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2 mb-1">
                <Webhook size={14} className="text-gray-500" />
                <span className="text-xs text-gray-500">Agents</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{overview?.agents ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">external agents</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2 mb-1">
                <Server size={14} className="text-gray-500" />
                <span className="text-xs text-gray-500">API Keys</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{overview?.apiKeys ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">active keys</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2 mb-1">
                <Activity size={14} className="text-gray-500" />
                <span className="text-xs text-gray-500">Pending</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{overview?.pendingApprovals ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">approvals</p>
            </div>
          </div>
        )}
      </div>

      {/* Backup placeholder */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
              <HardDrive size={16} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Database Backup</p>
              <p className="text-xs text-gray-400 mt-0.5">Automated backup configuration</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Not Configured
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Configure automated database backups to ensure data safety. Contact your system
          administrator to set up backup schedules.
        </p>
      </div>
    </div>
  );
}
