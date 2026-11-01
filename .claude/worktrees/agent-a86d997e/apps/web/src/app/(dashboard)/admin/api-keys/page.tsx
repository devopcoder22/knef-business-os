'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Key, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: { firstName: string; lastName: string; email: string } | null;
  externalAgent: { id: string; name: string; status: string } | null;
}

export default function ApiKeysPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const canManage = hasPermission(PERMISSIONS.ADMIN.MANAGE_API_KEYS);

  const { data, isLoading } = useQuery<ApiKey[]>({
    queryKey: ['admin-api-keys'],
    queryFn: async () => {
      const res = await api().get<ApiKey[]>('/admin/api-keys');
      return res.data;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().delete(`/admin/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
    },
  });

  const handleRevoke = (key: ApiKey) => {
    if (confirm(`Revoke API key "${key.name}"? Any integrations using it will immediately lose access.`)) {
      revokeMutation.mutate(key.id);
    }
  };

  const isExpired = (expiresAt: string | null) =>
    expiresAt ? new Date(expiresAt) < new Date() : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
        <p className="text-gray-500 text-sm mt-1">All active and revoked API keys across the platform</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Key Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Prefix</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Scopes</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Linked Agent</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Last Used</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Expires</th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: canManage ? 8 : 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !data || data.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 8 : 7}
                    className="px-4 py-12 text-center"
                  >
                    <Key size={32} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-gray-400 text-sm">No API keys found</p>
                  </td>
                </tr>
              ) : (
                data.map((key) => (
                  <tr key={key.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{key.name}</p>
                        {key.createdBy && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            by {key.createdBy.firstName} {key.createdBy.lastName}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {key.prefix}...
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {key.scopes.slice(0, 3).map((scope) => (
                          <span
                            key={scope}
                            className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium"
                          >
                            {scope}
                          </span>
                        ))}
                        {key.scopes.length > 3 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                            +{key.scopes.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {key.externalAgent ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{key.externalAgent.name}</span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full ${
                              key.externalAgent.status === 'ACTIVE'
                                ? 'bg-green-100 text-green-600'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {key.externalAgent.status}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          key.isActive && !isExpired(key.expiresAt)
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {key.isActive && !isExpired(key.expiresAt) ? (
                          <CheckCircle size={10} />
                        ) : (
                          <XCircle size={10} />
                        )}
                        {!key.isActive ? 'Revoked' : isExpired(key.expiresAt) ? 'Expired' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {key.lastUsedAt
                        ? format(new Date(key.lastUsedAt), 'MMM d, yyyy')
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {key.expiresAt ? (
                        <span className={isExpired(key.expiresAt) ? 'text-red-600 font-medium' : ''}>
                          {format(new Date(key.expiresAt), 'MMM d, yyyy')}
                        </span>
                      ) : (
                        <span className="text-gray-300">Never</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {key.isActive && (
                          <button
                            onClick={() => handleRevoke(key)}
                            disabled={revokeMutation.isPending}
                            className="flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-lg text-red-600 hover:bg-red-50 border border-red-200 ml-auto"
                          >
                            <Trash2 size={12} /> Revoke
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
