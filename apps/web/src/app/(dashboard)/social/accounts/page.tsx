'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshCw, Link2, CheckCircle, AlertTriangle, Clock, XCircle, Wifi, WifiOff } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SocialAccount {
  id: string;
  provider: string;
  providerAccountId: string;
  accountType: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  capabilities: string[];
  approvalStatus: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  connection: {
    id: string;
    displayName: string;
    status: string;
    tokenStatus: string | null;
    tokenExpiresAt: string | null;
  };
}

const PROVIDER_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  SNAPCHAT: 'Snapchat',
};

const PROVIDER_COLORS: Record<string, string> = {
  FACEBOOK: 'bg-blue-600',
  INSTAGRAM: 'bg-gradient-to-br from-purple-500 to-pink-500',
  TIKTOK: 'bg-gray-900',
  SNAPCHAT: 'bg-yellow-400',
};

const APPROVAL_CONFIG: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  READY: { label: 'Ready', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  CONNECTED: { label: 'Connected', color: 'text-blue-600 bg-blue-50', icon: Wifi },
  APP_REVIEW_PENDING: { label: 'App Review Pending', color: 'text-amber-600 bg-amber-50', icon: Clock },
  AUDIT_PENDING: { label: 'Audit Pending', color: 'text-amber-600 bg-amber-50', icon: AlertTriangle },
  SCOPES_INCOMPLETE: { label: 'Scopes Incomplete', color: 'text-red-600 bg-red-50', icon: XCircle },
  TOKEN_EXPIRED: { label: 'Token Expired', color: 'text-red-600 bg-red-50', icon: XCircle },
  DISCONNECTED: { label: 'Disconnected', color: 'text-gray-500 bg-gray-100', icon: WifiOff },
};

function ApprovalBadge({ status }: { status: string }) {
  const cfg = APPROVAL_CONFIG[status] ?? APPROVAL_CONFIG.CONNECTED;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const colorClass = PROVIDER_COLORS[provider] ?? 'bg-gray-400';
  const label = PROVIDER_LABELS[provider] ?? provider;
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white', colorClass)}>
      {label}
    </span>
  );
}

export default function SocialAccountsPage() {
  const queryClient = useQueryClient();
  const [connectionId, setConnectionId] = useState('');
  const [syncError, setSyncError] = useState('');

  const { data: accounts = [], isLoading } = useQuery<SocialAccount[]>({
    queryKey: ['social-accounts'],
    queryFn: () => api().get<SocialAccount[]>('/social/accounts').then((r) => r.data),
  });

  const syncMutation = useMutation({
    mutationFn: (connId: string) =>
      api().post<SocialAccount[]>('/social/accounts/sync', { connectionId: connId }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-accounts'] });
      setConnectionId('');
      setSyncError('');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setSyncError(err?.response?.data?.message ?? 'Sync failed');
    },
  });

  const handleSync = () => {
    if (!connectionId.trim()) {
      setSyncError('Please enter a connection ID');
      return;
    }
    syncMutation.mutate(connectionId.trim());
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Social Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Connected social media pages and profiles for publishing
          </p>
        </div>
        <a
          href="/integrations/connections"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Link2 className="w-4 h-4" />
          Connect More
        </a>
      </div>

      {/* Sync from connection */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Sync from Connection</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            placeholder="Paste connection ID..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', syncMutation.isPending && 'animate-spin')} />
            {syncMutation.isPending ? 'Syncing…' : 'Sync'}
          </button>
        </div>
        {syncError && <p className="text-xs text-red-600 mt-2">{syncError}</p>}
        {syncMutation.isSuccess && (
          <p className="text-xs text-green-600 mt-2">Sync complete — accounts updated.</p>
        )}
      </div>

      {/* Accounts list */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium">No social accounts connected</p>
          <p className="text-sm mt-1">
            Connect a Meta, TikTok, or Snapchat integration and click &ldquo;Sync&rdquo; to add accounts.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4"
            >
              {/* Avatar */}
              <div className="flex-shrink-0">
                {account.avatarUrl ? (
                  <img
                    src={account.avatarUrl}
                    alt={account.displayName}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-400">
                    {account.displayName[0]}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900 truncate">{account.displayName}</span>
                  {account.username && (
                    <span className="text-gray-400 text-sm">@{account.username}</span>
                  )}
                  <ProviderBadge provider={account.provider} />
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    {account.accountType}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ApprovalBadge status={account.approvalStatus} />
                </div>

                {/* Capabilities */}
                {account.capabilities.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {account.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded"
                      >
                        {cap.replace('CAN_', '').replace(/_/g, ' ').toLowerCase()}
                      </span>
                    ))}
                  </div>
                )}

                {account.lastSyncedAt && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    Last synced {new Date(account.lastSyncedAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Connection status */}
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-gray-400">via {account.connection.displayName}</p>
                <span
                  className={cn(
                    'text-xs font-medium',
                    account.connection.tokenStatus === 'active' ? 'text-green-600' : 'text-amber-500',
                  )}
                >
                  {account.connection.tokenStatus ?? 'unknown'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
