'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Eye, EyeOff, Pencil, Trash2, Check, X } from 'lucide-react';
import { api } from '@/lib/api';

interface CredentialListItem {
  key: string;
  label: string;
  group: string;
  groupLabel: string;
  description: string;
  sensitive: boolean;
  source: 'db' | 'env' | 'not_set';
  maskedValue: string | null;
}

type ByGroup = Record<string, { groupLabel: string; items: CredentialListItem[] }>;

function sourceBadge(source: CredentialListItem['source']) {
  if (source === 'db') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        Configured in DB
      </span>
    );
  }
  if (source === 'env') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
        Set via env
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
      Not set
    </span>
  );
}

function CredentialRow({
  item,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  item: CredentialListItem;
  onSave: (key: string, value: string) => void;
  onDelete: (key: string) => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);

  function handleSave() {
    if (!value.trim()) return;
    onSave(item.key, value.trim());
    setEditing(false);
    setValue('');
  }

  function handleCancel() {
    setEditing(false);
    setValue('');
  }

  return (
    <div className="py-4 px-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-sm text-gray-900">{item.label}</span>
            {sourceBadge(item.source)}
          </div>
          <p className="text-xs text-gray-500 mb-1">{item.description}</p>
          <code className="text-xs text-gray-400">{item.key}</code>
          {item.maskedValue && !editing && (
            <div className="mt-1 flex items-center gap-1">
              <span className="text-xs font-mono text-gray-600">
                {showValue ? item.maskedValue : '••••••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                className="text-gray-400 hover:text-gray-600"
              >
                {showValue ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={saving || deleting}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                <Pencil className="h-3 w-3" />
                {item.source === 'not_set' ? 'Set' : 'Update'}
              </button>
              {item.source === 'db' && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove "${item.label}" from DB? The env var fallback will apply if set.`)) {
                      onDelete(item.key);
                    }
                  }}
                  disabled={deleting || saving}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              )}
            </>
          )}
          {editing && (
            <div className="flex items-center gap-2">
              <input
                type="password"
                autoFocus
                placeholder="Paste value…"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
                className="w-48 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !value.trim()}
                className="p-1.5 text-green-700 bg-green-50 border border-green-300 rounded hover:bg-green-100 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="p-1.5 text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CredentialsPage() {
  const queryClient = useQueryClient();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<CredentialListItem[]>({
    queryKey: ['admin-credentials'],
    queryFn: async () => {
      const res = await api().get<{ data: CredentialListItem[] }>('/credentials');
      return res.data.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await api().put(`/credentials/${key}`, { value });
    },
    onMutate: ({ key }) => setSavingKey(key),
    onSettled: () => {
      setSavingKey(null);
      queryClient.invalidateQueries({ queryKey: ['admin-credentials'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      await api().delete(`/credentials/${key}`);
    },
    onMutate: (key) => setDeletingKey(key),
    onSettled: () => {
      setDeletingKey(null);
      queryClient.invalidateQueries({ queryKey: ['admin-credentials'] });
    },
  });

  const grouped: ByGroup = {};
  for (const item of data ?? []) {
    if (!grouped[item.group]) {
      grouped[item.group] = { groupLabel: item.groupLabel, items: [] };
    }
    grouped[item.group].items.push(item);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading credentials…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-sm">
        Failed to load credentials.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Integration Credentials</h1>
          <p className="text-sm text-gray-500">
            Values stored here are AES-256-GCM encrypted in the database and take priority over env vars.
          </p>
        </div>
      </div>

      {Object.entries(grouped).map(([group, { groupLabel, items }]) => (
        <div key={group} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">{groupLabel}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <CredentialRow
                key={item.key}
                item={item}
                onSave={(key, value) => saveMutation.mutate({ key, value })}
                onDelete={(key) => deleteMutation.mutate(key)}
                saving={savingKey === item.key}
                deleting={deletingKey === item.key}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
