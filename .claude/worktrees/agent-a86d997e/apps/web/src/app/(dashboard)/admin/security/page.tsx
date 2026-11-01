'use client';

import { useQuery } from '@tanstack/react-query';
import { format, subDays, isAfter } from 'date-fns';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface SecurityEvent {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

const EVENT_SEVERITY: Record<string, { cls: string; label: string }> = {
  LOGIN_FAILED: { cls: 'bg-red-100 text-red-700', label: 'Login Failed' },
  AUTH_DENIED: { cls: 'bg-red-100 text-red-700', label: 'Auth Denied' },
  API_KEY_REVOKED: { cls: 'bg-orange-100 text-orange-700', label: 'Key Revoked' },
  PERMISSION_DENIED: { cls: 'bg-amber-100 text-amber-700', label: 'Permission Denied' },
  SUSPICIOUS_ACTIVITY: { cls: 'bg-red-200 text-red-800', label: 'Suspicious Activity' },
  LOGOUT: { cls: 'bg-gray-100 text-gray-600', label: 'Logout' },
  LOGIN: { cls: 'bg-blue-100 text-blue-700', label: 'Login' },
};

function getEventStyle(action: string) {
  for (const [key, val] of Object.entries(EVENT_SEVERITY)) {
    if (action.includes(key)) return val;
  }
  return { cls: 'bg-gray-100 text-gray-600', label: action };
}

export default function SecurityPage() {
  const { hasPermission } = useAuthStore();

  const permissionKey = (PERMISSIONS.ADMIN as Record<string, string>).VIEW_SECURITY
    ? PERMISSIONS.ADMIN.VIEW_SECURITY
    : PERMISSIONS.ADMIN.VIEW_AUDIT;

  if (!hasPermission(permissionKey)) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p className="text-sm">You do not have permission to view security events.</p>
      </div>
    );
  }

  return <SecurityPageContent />;
}

function SecurityPageContent() {
  const { data, isLoading } = useQuery<SecurityEvent[]>({
    queryKey: ['security-events'],
    queryFn: async () => {
      const res = await api().get<SecurityEvent[]>('/admin/security-events?limit=100');
      return res.data;
    },
  });

  const now = new Date();
  const last24h = data?.filter((e) => isAfter(new Date(e.createdAt), subDays(now, 1))).length ?? 0;
  const last7d = data?.filter((e) => isAfter(new Date(e.createdAt), subDays(now, 7))).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Events</h1>
        <p className="text-gray-500 text-sm mt-1">
          Authentication failures, permission denials, and suspicious activity
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Events (last 24h)</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{last24h}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Events (last 7 days)</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{last7d}</p>
        </div>
      </div>

      {/* Events List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">When</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Event</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">IP Address</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !data || data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <ShieldAlert size={32} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-gray-400 text-sm">No security events found</p>
                  </td>
                </tr>
              ) : (
                data.map((event) => {
                  const style = getEventStyle(event.action);
                  return (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm:ss')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.cls}`}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {event.user ? (
                          <div>
                            <p className="font-medium text-gray-900 text-xs">
                              {event.user.firstName} {event.user.lastName}
                            </p>
                            <p className="text-gray-400 text-xs">{event.user.email}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">System</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">
                        {event.ipAddress ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <span className="font-medium">{event.entity}</span>
                        {event.entityId && (
                          <span className="text-gray-400 ml-1 font-mono">
                            {event.entityId.slice(0, 8)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
