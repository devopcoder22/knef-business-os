'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Settings } from 'lucide-react';
import { api } from '@/lib/api';

interface TelegramConfig {
  id: string;
  chatId: string;
  username: string | null;
  isActive: boolean;
  notifyOrders: boolean;
  notifyInventory: boolean;
  notifyFinance: boolean;
}

interface ConfigForm {
  botToken: string;
  chatId: string;
  username: string;
  isActive: boolean;
  notifyOrders: boolean;
  notifyInventory: boolean;
  notifyFinance: boolean;
}

const defaultForm: ConfigForm = {
  botToken: '',
  chatId: '',
  username: '',
  isActive: true,
  notifyOrders: true,
  notifyInventory: true,
  notifyFinance: true,
};

export default function TelegramPage() {
  const qc = useQueryClient();
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [form, setForm] = useState<ConfigForm>(defaultForm);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: config, isLoading } = useQuery<TelegramConfig | null>({
    queryKey: ['telegram-config'],
    queryFn: async () => {
      const res = await api().get<{ data: TelegramConfig | null }>('/telegram/config');
      return res.data.data ?? null;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: (data: ConfigForm) =>
      api().post('/telegram/config', {
        botToken: data.botToken,
        chatId: data.chatId,
        username: data.username || undefined,
        isActive: data.isActive,
        notifyOrders: data.notifyOrders,
        notifyInventory: data.notifyInventory,
        notifyFinance: data.notifyFinance,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['telegram-config'] });
      setShowConfigForm(false);
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (data: Partial<ConfigForm>) => api().patch('/telegram/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-config'] }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<{ data: { success: boolean; message: string } }>('/telegram/config/test');
      return res.data.data ?? res.data;
    },
    onSuccess: (data) => setTestResult(data as { success: boolean; message: string }),
  });

  const openConfigForm = () => {
    setForm({
      ...defaultForm,
      chatId: config?.chatId ?? '',
      username: config?.username ?? '',
      isActive: config?.isActive ?? true,
      notifyOrders: config?.notifyOrders ?? true,
      notifyInventory: config?.notifyInventory ?? true,
      notifyFinance: config?.notifyFinance ?? true,
    });
    setShowConfigForm(true);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Telegram</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure a Telegram bot to receive real-time business notifications.
        </p>
      </div>

      {testResult && (
        <div className={`p-4 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testResult.message}
          <button onClick={() => setTestResult(null)} className="ml-4 underline">Dismiss</button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : config ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center">
                <MessageSquare className="text-sky-600" size={24} />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">
                  {config.username ? `@${config.username}` : 'Telegram Bot'}
                </h2>
                <p className="text-sm text-gray-500">Chat ID: {config.chatId}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {config.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Notification Settings</h3>
            <div className="space-y-3">
              {[
                { key: 'notifyOrders' as const, label: 'New Orders' },
                { key: 'notifyInventory' as const, label: 'Inventory Alerts' },
                { key: 'notifyFinance' as const, label: 'Finance Updates' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{label}</span>
                  <input
                    type="checkbox"
                    checked={config[key]}
                    onChange={(e) => settingsMutation.mutate({ [key]: e.target.checked })}
                    className="w-4 h-4 accent-blue-600"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !config.isActive}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <Send size={15} />
              {testMutation.isPending ? 'Sending...' : 'Send Test'}
            </button>
            <button
              onClick={openConfigForm}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <Settings size={15} />
              Reconfigure
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="text-sky-500" size={32} />
          </div>
          <h2 className="font-semibold text-gray-900 mb-2">No Telegram Bot Configured</h2>
          <p className="text-sm text-gray-500 mb-4">
            Create a Telegram bot via @BotFather and configure it here to receive notifications.
          </p>
          <button
            onClick={openConfigForm}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            Configure Bot
          </button>
        </div>
      )}

      {showConfigForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Configure Telegram Bot</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token *</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.botToken}
                  onChange={(e) => setForm((f) => ({ ...f, botToken: e.target.value }))}
                  placeholder="123456789:ABCdef..."
                />
                <p className="text-xs text-gray-400 mt-1">Get this from @BotFather</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chat ID *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.chatId}
                  onChange={(e) => setForm((f) => ({ ...f, chatId: e.target.value }))}
                  placeholder="-100123456789"
                />
                <p className="text-xs text-gray-400 mt-1">Your channel or group chat ID</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bot Username</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="knef_alerts_bot"
                />
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">Notify for:</p>
                {[
                  { key: 'notifyOrders' as const, label: 'New Orders' },
                  { key: 'notifyInventory' as const, label: 'Inventory Alerts' },
                  { key: 'notifyFinance' as const, label: 'Finance Updates' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowConfigForm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => upsertMutation.mutate(form)}
                disabled={upsertMutation.isPending || !form.botToken || !form.chatId}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {upsertMutation.isPending ? 'Saving...' : 'Save Config'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
