'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  Calendar,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CalendarConnection {
  id: string;
  provider: string;
  calendarId: string | null;
  calendarName: string | null;
  isActive: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  scope: string | null;
}

interface ProviderCalendar {
  id: string;
  name: string;
  isPrimary: boolean;
  accessRole: string;
  backgroundColor?: string;
}

type Provider = 'google' | 'microsoft';

const PROVIDERS: Array<{ id: Provider; label: string; icon: string; description: string }> = [
  {
    id: 'google',
    label: 'Google Calendar',
    icon: '🗓',
    description: 'Connect your Google Calendar to view and manage events.',
  },
  {
    id: 'microsoft',
    label: 'Microsoft Outlook',
    icon: '📅',
    description: 'Connect your Outlook or Microsoft 365 calendar.',
  },
];

export default function CalendarSettingsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedConnection, setExpandedConnection] = useState<string | null>(null);
  const [providerCalendars, setProviderCalendars] = useState<Record<string, ProviderCalendar[]>>({});

  // Handle OAuth callback query params
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected === 'true') {
      setSuccessMessage('Calendar connected successfully!');
      queryClient.invalidateQueries({ queryKey: ['calendar-connections'] });
    }
    if (error) {
      const messages: Record<string, string> = {
        missing_params: 'Missing OAuth parameters. Please try again.',
        callback_failed: 'Failed to complete calendar connection. Please try again.',
        access_denied: 'Calendar access was denied.',
      };
      setErrorMessage(messages[error] ?? `Connection error: ${error}`);
    }
  }, [searchParams, queryClient]);

  const { data: connections = [], isLoading } = useQuery<CalendarConnection[]>({
    queryKey: ['calendar-connections'],
    queryFn: () => api().get('/calendar/connections').then((r) => r.data),
  });

  const connectMutation = useMutation({
    mutationFn: (provider: Provider) =>
      api().post(`/calendar/connections/${provider}/authorize`).then((r) => r.data),
    onSuccess: (data: { url: string }) => {
      window.location.href = data.url;
    },
    onError: () => setErrorMessage('Failed to initiate connection. Check that OAuth credentials are configured.'),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api().delete(`/calendar/connections/${id}`),
    onSuccess: () => {
      setSuccessMessage('Calendar disconnected.');
      queryClient.invalidateQueries({ queryKey: ['calendar-connections'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api().get(`/calendar/connections/${id}/test`).then((r) => r.data),
    onSuccess: (data: { ok: boolean; message: string }) => {
      setSuccessMessage(data.message);
    },
  });

  const loadCalendarsMutation = useMutation({
    mutationFn: (id: string) =>
      api().get(`/calendar/connections/${id}/calendars`).then((r) => r.data),
    onSuccess: (data: ProviderCalendar[], id: string) => {
      setProviderCalendars((prev) => ({ ...prev, [id]: data }));
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: ({ id, calendarId, calendarName }: { id: string; calendarId: string; calendarName?: string }) =>
      api().patch(`/calendar/connections/${id}/default-calendar`, { calendarId, calendarName }),
    onSuccess: () => {
      setSuccessMessage('Default calendar updated.');
      queryClient.invalidateQueries({ queryKey: ['calendar-connections'] });
    },
  });

  const providerLabel = (p: string) =>
    ({ google: 'Google Calendar', microsoft: 'Microsoft Outlook' }[p] ?? p);

  const connectedProviders = new Set(connections.map((c) => c.provider));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Calendar Settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Connect your calendar to view and manage events from KNEF Business OS.
        </p>
      </div>

      {/* Status messages */}
      {successMessage && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle size={16} />
          {successMessage}
          <button onClick={() => setSuccessMessage(null)} className="ml-auto text-green-500 hover:text-green-700">
            ×
          </button>
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle size={16} />
          {errorMessage}
          <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-500 hover:text-red-700">
            ×
          </button>
        </div>
      )}

      {/* Connected calendars */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : connections.length > 0 ? (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Connected Calendars
          </h2>
          <div className="space-y-3">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{PROVIDERS.find((p) => p.id === conn.provider)?.icon ?? '🗓'}</span>
                    <div>
                      <p className="font-medium text-gray-900">{providerLabel(conn.provider)}</p>
                      <p className="text-xs text-gray-500">
                        {conn.calendarName ?? conn.calendarId ?? 'Primary'} ·{' '}
                        {conn.isActive ? (
                          <span className="text-green-600 font-medium">Connected</span>
                        ) : (
                          <span className="text-red-600 font-medium">Disconnected</span>
                        )}
                        {conn.lastSyncAt && ` · Last synced ${new Date(conn.lastSyncAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testMutation.mutate(conn.id)}
                      disabled={testMutation.isPending}
                      className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      {testMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                    </button>
                    <button
                      onClick={() => {
                        setExpandedConnection(expandedConnection === conn.id ? null : conn.id);
                        if (expandedConnection !== conn.id && !providerCalendars[conn.id]) {
                          loadCalendarsMutation.mutate(conn.id);
                        }
                      }}
                      className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Manage
                    </button>
                    <button
                      onClick={() => disconnectMutation.mutate(conn.id)}
                      disabled={disconnectMutation.isPending}
                      className="text-red-500 hover:text-red-700 p-1.5"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Expanded: calendar picker */}
                {expandedConnection === conn.id && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50">
                    <p className="text-xs font-medium text-gray-600 mb-3">Select default calendar</p>
                    {loadCalendarsMutation.isPending ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 size={14} className="animate-spin" />
                        Loading calendars...
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {(providerCalendars[conn.id] ?? []).map((cal) => (
                          <label key={cal.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer">
                            <input
                              type="radio"
                              name={`calendar-${conn.id}`}
                              checked={conn.calendarId === cal.id}
                              onChange={() =>
                                setDefaultMutation.mutate({ id: conn.id, calendarId: cal.id, calendarName: cal.name })
                              }
                            />
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: cal.backgroundColor ?? '#4285f4' }}
                            />
                            <span className="text-sm text-gray-700">{cal.name}</span>
                            {cal.isPrimary && (
                              <span className="text-xs text-blue-600 font-medium">Primary</span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Add provider */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Add Calendar Provider
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PROVIDERS.map((p) => {
            const isConnected = connectedProviders.has(p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  'bg-white border rounded-xl p-5',
                  isConnected ? 'border-green-200 bg-green-50' : 'border-gray-200',
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{p.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-900">{p.label}</p>
                    {isConnected && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle size={11} />
                        Connected
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-4">{p.description}</p>
                <button
                  onClick={() => connectMutation.mutate(p.id)}
                  disabled={connectMutation.isPending}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg font-medium',
                    isConnected
                      ? 'border border-gray-200 text-gray-600 hover:bg-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700',
                  )}
                >
                  {connectMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ExternalLink size={14} />
                  )}
                  {isConnected ? 'Reconnect' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Setup note */}
      <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <p className="font-medium mb-1">Setup required</p>
        <p>
          Calendar integration requires OAuth credentials from{' '}
          <strong>Google Cloud Console</strong> (for Google) and{' '}
          <strong>Azure Active Directory</strong> (for Microsoft). Contact your system administrator
          if the connection button doesn&apos;t work.
        </p>
      </div>
    </div>
  );
}
