'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Database, Server, Users, Webhook, HardDrive, Play, Settings, RefreshCw } from 'lucide-react';
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

interface BackupConfig {
  enabled: boolean;
  schedule: string;
  retentionDays: number;
}

interface BackupRecord {
  id: string;
  filename: string;
  sizeBytes: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  triggeredBy: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === 'up' || status === 'ok';
  const warn = status === 'not_configured' || status === 'unknown';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
        ok
          ? 'bg-green-100 text-green-700'
          : warn
          ? 'bg-amber-100 text-amber-700'
          : 'bg-red-100 text-red-700'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          ok ? 'bg-green-500' : warn ? 'bg-amber-500' : 'bg-red-500'
        }`}
      />
      {ok ? 'Healthy' : warn ? 'Not Configured' : 'Degraded'}
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

function formatBytes(bytes: string | null): string {
  if (!bytes) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function HealthPage() {
  const queryClient = useQueryClient();
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configDraft, setConfigDraft] = useState<BackupConfig | null>(null);

  const { data: health, isLoading: healthLoading, dataUpdatedAt } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api().get<HealthData>('/health');
      return ((res.data as any)?.data ?? res.data) as HealthData;
    },
    refetchInterval: 30000,
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      const res = await api().get('/admin/overview');
      return ((res.data as any)?.data ?? res.data) as OverviewData;
    },
  });

  const { data: backupConfig } = useQuery<BackupConfig>({
    queryKey: ['backup-config'],
    queryFn: async () => {
      const res = await api().get('/admin/backup/config');
      return ((res.data as any)?.data ?? res.data) as BackupConfig;
    },
  });

  const { data: backups } = useQuery<BackupRecord[]>({
    queryKey: ['backup-list'],
    queryFn: async () => {
      const res = await api().get('/admin/backup');
      const d = ((res.data as any)?.data ?? res.data) as BackupRecord[];
      return d;
    },
    refetchInterval: 60000,
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (cfg: BackupConfig) => {
      const res = await api().put('/admin/backup/config', cfg);
      return ((res.data as any)?.data ?? res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-config'] });
      setShowConfigForm(false);
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post('/admin/backup/trigger');
      return ((res.data as any)?.data ?? res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-list'] });
    },
  });

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : 'Loading...';

  const lastBackup = backups?.[0];
  const backupStatus = !backupConfig
    ? 'not_configured'
    : backupConfig.enabled
    ? 'ok'
    : 'not_configured';

  function openConfigForm() {
    setConfigDraft(
      backupConfig ?? { enabled: true, schedule: '0 2 * * *', retentionDays: 30 },
    );
    setShowConfigForm(true);
  }

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
              status={backupStatus}
              detail={
                lastBackup
                  ? `Last backup: ${new Date(lastBackup.startedAt).toLocaleString()}`
                  : 'No backups yet'
              }
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

      {/* Database Backup */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
              <HardDrive size={16} className="text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Database Backup</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {backupConfig?.enabled
                  ? `Scheduled: ${backupConfig.schedule} · ${backupConfig.retentionDays}d retention`
                  : 'Automated backup not enabled'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openConfigForm}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
            >
              <Settings size={12} />
              Configure
            </button>
            <button
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {triggerMutation.isPending ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Play size={12} />
              )}
              {triggerMutation.isPending ? 'Running…' : 'Backup Now'}
            </button>
          </div>
        </div>

        {/* Config form */}
        {showConfigForm && configDraft && (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
            <p className="text-sm font-medium text-gray-700">Backup Configuration</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Enabled</label>
                <select
                  value={configDraft.enabled ? 'true' : 'false'}
                  onChange={(e) =>
                    setConfigDraft({ ...configDraft, enabled: e.target.value === 'true' })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cron Schedule</label>
                <input
                  value={configDraft.schedule}
                  onChange={(e) => setConfigDraft({ ...configDraft, schedule: e.target.value })}
                  placeholder="0 2 * * *"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <p className="text-xs text-gray-400 mt-0.5">Default: 0 2 * * * (daily at 2 AM)</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Retention (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={configDraft.retentionDays}
                  onChange={(e) =>
                    setConfigDraft({ ...configDraft, retentionDays: parseInt(e.target.value, 10) || 30 })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfigForm(false)}
                className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => saveConfigMutation.mutate(configDraft)}
                disabled={saveConfigMutation.isPending}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saveConfigMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Backup history */}
        {backups && backups.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">File</th>
                <th className="text-left py-2 font-medium text-gray-500">Started</th>
                <th className="text-right py-2 font-medium text-gray-500">Size</th>
                <th className="text-right py-2 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-mono text-gray-700 truncate max-w-[180px]">{b.filename}</td>
                  <td className="py-2 text-gray-500">
                    {new Date(b.startedAt).toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-gray-500">{formatBytes(b.sizeBytes)}</td>
                  <td className="py-2 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium ${
                        b.status === 'COMPLETED'
                          ? 'bg-green-100 text-green-700'
                          : b.status === 'RUNNING'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-gray-400 text-center py-4">No backups yet. Click &quot;Backup Now&quot; to run the first backup.</p>
        )}

        {triggerMutation.isError && (
          <p className="text-xs text-red-600">Backup failed. Check server logs.</p>
        )}
        {triggerMutation.isSuccess && (
          <p className="text-xs text-green-600">Backup completed successfully.</p>
        )}
      </div>
    </div>
  );
}
