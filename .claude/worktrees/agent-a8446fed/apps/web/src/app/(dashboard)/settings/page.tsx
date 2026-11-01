'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface Setting {
  id: string;
  key: string;
  value: string;
  type: string;
  group: string | null;
  label: string | null;
  description: string | null;
}

interface SettingsResponse {
  data: Setting[];
}

const SETTING_GROUPS = ['general', 'documents', 'finance', 'inventory'];

export default function SettingsPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedGroups, setSavedGroups] = useState<Set<string>>(new Set());

  const canEdit = hasPermission(PERMISSIONS.SETTINGS.EDIT);

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api().get<SettingsResponse>('/settings');
      return res.data;
    },
  });

  useEffect(() => {
    if (data?.data) {
      const initial: Record<string, string> = {};
      data.data.forEach((s) => { initial[s.key] = s.value; });
      setValues(initial);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (group: string) => {
      const groupSettings = data?.data
        .filter((s) => s.group === group)
        .map((s) => ({ key: s.key, value: values[s.key] ?? s.value })) ?? [];

      await api().patch('/settings', { settings: groupSettings });
    },
    onSuccess: (_data, group) => {
      setSavedGroups((prev) => new Set([...prev, group]));
      setTimeout(() => {
        setSavedGroups((prev) => {
          const next = new Set(prev);
          next.delete(group);
          return next;
        });
      }, 2000);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const groupedSettings = SETTING_GROUPS.reduce<Record<string, Setting[]>>((acc, group) => {
    acc[group] = data?.data.filter((s) => s.group === group) ?? [];
    return acc;
  }, {});

  const GROUP_LABELS: Record<string, string> = {
    general: 'General',
    documents: 'Document Numbering',
    finance: 'Finance & Tax',
    inventory: 'Inventory',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business Settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure your organization defaults and preferences
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        SETTING_GROUPS.map((group) => {
          const settings = groupedSettings[group] ?? [];
          if (settings.length === 0) return null;

          return (
            <div key={group} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-semibold text-gray-900">
                  {GROUP_LABELS[group] ?? group}
                </h2>
                {canEdit && (
                  <button
                    onClick={() => saveMutation.mutate(group)}
                    disabled={saveMutation.isPending}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      savedGroups.has(group)
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400'
                    }`}
                  >
                    {saveMutation.isPending && saveMutation.variables === group ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    {savedGroups.has(group) ? 'Saved!' : 'Save'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {settings.map((setting) => (
                  <div key={setting.key}>
                    <label
                      htmlFor={setting.key}
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {setting.label ?? setting.key}
                    </label>
                    {setting.description && (
                      <p className="text-xs text-gray-400 mb-1.5">{setting.description}</p>
                    )}
                    {setting.type === 'boolean' ? (
                      <select
                        id={setting.key}
                        value={values[setting.key] ?? 'false'}
                        onChange={(e) => setValues((v) => ({ ...v, [setting.key]: e.target.value }))}
                        disabled={!canEdit}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        id={setting.key}
                        type={setting.type === 'number' ? 'number' : 'text'}
                        value={values[setting.key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [setting.key]: e.target.value }))}
                        disabled={!canEdit}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
