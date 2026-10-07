'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Settings, Link2, Link2Off, Copy, Check, Users, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TelegramConfig {
  id: string;
  chatId: string | null;
  username: string | null;
  isActive: boolean;
  notifyOrders: boolean;
  notifyInventory: boolean;
  notifyFinance: boolean;
}

interface LinkedUser {
  id: string;
  userId: string;
  telegramId: string;
  telegramUsername: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  notifyOrders: boolean;
  notifyInventory: boolean;
  notifyFinance: boolean;
  notifyTasks: boolean;
  notifyLowStock: boolean;
  notifyTargets: boolean;
  createdAt: string;
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

const USER_PREF_LABELS = [
  { key: 'notifyOrders', label: 'New Orders' },
  { key: 'notifyInventory', label: 'Inventory Alerts' },
  { key: 'notifyFinance', label: 'Finance Updates' },
  { key: 'notifyTasks', label: 'Task Reminders' },
  { key: 'notifyLowStock', label: 'Low Stock Alerts' },
  { key: 'notifyTargets', label: 'Goal Progress' },
] as const;

export default function TelegramPage() {
  const qc = useQueryClient();
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [form, setForm] = useState<ConfigForm>(defaultForm);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [linkCode, setLinkCode] = useState<{ code: string; expiresInSeconds: number } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const { data: config, isLoading } = useQuery<TelegramConfig | null>({
    queryKey: ['telegram-config'],
    queryFn: async () => {
      const res = await api().get<{ data: TelegramConfig | null }>('/telegram/config');
      return res.data.data ?? null;
    },
  });

  const { data: linkedUsers, isLoading: usersLoading } = useQuery<LinkedUser[]>({
    queryKey: ['telegram-linked-users'],
    queryFn: async () => {
      const res = await api().get('/telegram/linked-users');
      const d = (res.data as { data?: LinkedUser[] }).data ?? res.data;
      return Array.isArray(d) ? d : [];
    },
    enabled: !!config,
  });

  const upsertMutation = useMutation({
    mutationFn: (data: ConfigForm) =>
      api().post('/telegram/config', {
        botToken: data.botToken,
        chatId: data.chatId || undefined,
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

  const generateCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post('/telegram/generate-link-code');
      const body = res.data as { data?: { code: string; expiresInSeconds: number } } | { code: string; expiresInSeconds: number };
      return ('data' in body && body.data ? body.data : body) as { code: string; expiresInSeconds: number };
    },
    onSuccess: (data) => {
      setLinkCode(data);
      setCopiedCode(false);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (userId: string) => api().delete(`/telegram/linked-users/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-linked-users'] }),
  });

  const prefsMutation = useMutation({
    mutationFn: ({ userId, prefs }: { userId: string; prefs: Record<string, boolean> }) =>
      api().patch(`/telegram/linked-users/${userId}/preferences`, prefs),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-linked-users'] }),
  });

  const copyCode = () => {
    if (linkCode) {
      void navigator.clipboard.writeText(linkCode.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

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
          Configure a Telegram bot for real-time notifications and interactive commands.
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
        <>
          {/* Bot Config Card */}
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
                  {config.chatId && (
                    <p className="text-sm text-gray-500">Channel: {config.chatId}</p>
                  )}
                </div>
              </div>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', config.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                {config.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Channel Notifications</h3>
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

          {/* Link User Section */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Users size={16} />
                  Linked Staff Accounts
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Staff can link their Telegram account to receive personal alerts and use bot commands.
                </p>
              </div>
              <button
                onClick={() => generateCodeMutation.mutate()}
                disabled={generateCodeMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Link2 size={14} />
                {generateCodeMutation.isPending ? 'Generating...' : 'Generate Link Code'}
              </button>
            </div>

            {linkCode && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-2">Share this code with the staff member:</p>
                <div className="flex items-center gap-3">
                  <code className="text-2xl font-mono font-bold text-blue-700 tracking-widest">
                    {linkCode.code}
                  </code>
                  <button
                    onClick={copyCode}
                    className="p-1.5 rounded hover:bg-blue-100 text-blue-600"
                    title="Copy code"
                  >
                    {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  They should send <code className="bg-blue-100 px-1 rounded">/link {linkCode.code}</code> to the bot.
                  Expires in {Math.floor(linkCode.expiresInSeconds / 60)} minutes.
                </p>
                <button
                  onClick={() => setLinkCode(null)}
                  className="text-xs text-blue-500 hover:underline mt-1"
                >
                  Dismiss
                </button>
              </div>
            )}

            {usersLoading ? (
              <div className="text-center py-4 text-gray-400 text-sm">Loading...</div>
            ) : !linkedUsers || linkedUsers.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                No staff accounts linked yet. Generate a code above to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedUsers.map((user) => (
                  <div key={user.id} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-2 h-2 rounded-full', user.isVerified ? 'bg-green-500' : 'bg-gray-300')} />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {user.telegramUsername ? `@${user.telegramUsername}` : `ID: ${user.telegramId}`}
                          </p>
                          <p className="text-xs text-gray-400">
                            {user.isVerified && user.verifiedAt
                              ? `Linked ${new Date(user.verifiedAt).toLocaleDateString()}`
                              : 'Not verified'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          title="Edit preferences"
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          onClick={() => unlinkMutation.mutate(user.userId)}
                          disabled={unlinkMutation.isPending}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500"
                          title="Unlink"
                        >
                          <Link2Off size={14} />
                        </button>
                      </div>
                    </div>

                    {expandedUser === user.id && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                        <p className="text-xs font-medium text-gray-600 mb-2">Personal notification preferences:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {USER_PREF_LABELS.map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="checkbox"
                                checked={user[key]}
                                onChange={(e) =>
                                  prefsMutation.mutate({
                                    userId: user.userId,
                                    prefs: { [key]: e.target.checked },
                                  })
                                }
                                className="w-3.5 h-3.5 accent-blue-600"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bot Commands Reference */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Available Bot Commands</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['/link {code}', 'Link your account'],
                ['/sales', 'Sales summary'],
                ['/inventory', 'Low stock alerts'],
                ['/profit', 'P&L this month'],
                ['/tasks', 'Your open tasks'],
                ['/orders', 'Pending orders'],
                ['/targets', 'Goals progress'],
                ['/daily', 'Full digest'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-start gap-2">
                  <code className="text-xs bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">{cmd}</code>
                  <span className="text-xs text-gray-500">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Staff can also ask questions in plain language. The bot uses AI to interpret business queries.
            </p>
          </div>
        </>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="text-sky-500" size={32} />
          </div>
          <h2 className="font-semibold text-gray-900 mb-2">No Telegram Bot Configured</h2>
          <p className="text-sm text-gray-500 mb-4">
            Create a Telegram bot via @BotFather and configure it here to receive notifications and enable interactive commands.
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Channel Chat ID</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.chatId}
                  onChange={(e) => setForm((f) => ({ ...f, chatId: e.target.value }))}
                  placeholder="-100123456789"
                />
                <p className="text-xs text-gray-400 mt-1">Optional — for organization-wide broadcast notifications</p>
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
                <p className="text-sm font-medium text-gray-700">Channel notifications:</p>
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
                disabled={upsertMutation.isPending || !form.botToken}
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
