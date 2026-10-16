'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Star, Send, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type ProviderType = 'smtp' | 'sendgrid' | 'mailgun';

interface EmailProvider {
  id: string;
  name: string;
  type: ProviderType;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  username: string | null;
  fromEmail: string;
  fromName: string;
  isDefault: boolean;
  isActive: boolean;
}

interface FormState {
  name: string;
  type: ProviderType;
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  apiKey: string;
  fromEmail: string;
  fromName: string;
  isDefault: boolean;
}

const defaultForm: FormState = {
  name: '',
  type: 'smtp',
  host: '',
  port: '587',
  secure: false,
  username: '',
  password: '',
  apiKey: '',
  fromEmail: '',
  fromName: '',
  isDefault: false,
};

const TYPE_BADGES: Record<ProviderType, string> = {
  smtp: 'bg-blue-100 text-blue-700',
  sendgrid: 'bg-green-100 text-green-700',
  mailgun: 'bg-red-100 text-red-700',
};

function ProviderForm({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="My SMTP Provider"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <select
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ProviderType }))}
        >
          <option value="smtp">SMTP</option>
          <option value="sendgrid">SendGrid</option>
          <option value="mailgun">Mailgun</option>
        </select>
      </div>

      {form.type === 'smtp' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.secure}
              onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))}
            />
            <span className="text-sm text-gray-700">Use TLS/SSL</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>
            </label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
            />
          </div>
        </>
      )}

      {(form.type === 'sendgrid' || form.type === 'mailgun') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>
          </label>
          <input
            type="password"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder="••••••••"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.fromName}
            onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
            placeholder="KNEF Gadgets"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
          <input
            type="email"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.fromEmail}
            onChange={(e) => setForm((f) => ({ ...f, fromEmail: e.target.value }))}
            placeholder="noreply@knef.com"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
        />
        <span className="text-sm text-gray-700">Set as default provider</span>
      </label>
    </div>
  );
}

export default function EmailProvidersPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editProvider, setEditProvider] = useState<EmailProvider | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; error?: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: providers = [], isLoading } = useQuery<EmailProvider[]>({
    queryKey: ['email-providers'],
    queryFn: async () => {
      const res = await api().get('/email-providers');
      return (res.data as any).data ?? res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const payload = buildPayload(data);
      return api().post('/email-providers', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-providers'] });
      setShowAdd(false);
      setForm(defaultForm);
      setSaveError(null);
    },
    onError: (err: any) => {
      setSaveError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err?.message ?? 'Failed to save provider');
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormState }) => {
      const payload = buildPayload(data, true);
      return api().patch(`/email-providers/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-providers'] });
      setEditProvider(null);
      setSaveError(null);
    },
    onError: (err: any) => {
      setSaveError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err?.message ?? 'Failed to update provider');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api().delete(`/email-providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-providers'] }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => api().post(`/email-providers/${id}/set-default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-providers'] }),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api().post(`/email-providers/${id}/test`);
      const body = (res.data as any).data ?? res.data;
      return { id, success: body.success as boolean, error: body.error as string | undefined };
    },
    onSuccess: (data) => setTestResult(data),
    onError: (err: any) => {
      setTestResult({ id: '', success: false, error: err?.response?.data?.error?.message ?? err?.message ?? 'Request failed' });
    },
  });

  function buildPayload(data: FormState, isEdit = false) {
    const payload: Record<string, unknown> = {
      name: data.name,
      type: data.type,
      fromEmail: data.fromEmail,
      fromName: data.fromName,
      isDefault: data.isDefault,
    };
    if (data.type === 'smtp') {
      payload.host = data.host;
      payload.port = parseInt(data.port);
      payload.secure = data.secure;
      payload.username = data.username;
      if (data.password) payload.password = data.password;
    } else {
      if (data.apiKey) payload.apiKey = data.apiKey;
    }
    return payload;
  }

  function openEdit(provider: EmailProvider) {
    setEditProvider(provider);
    setForm({
      name: provider.name,
      type: provider.type,
      host: provider.host ?? '',
      port: provider.port?.toString() ?? '587',
      secure: provider.secure ?? false,
      username: provider.username ?? '',
      password: '',
      apiKey: '',
      fromEmail: provider.fromEmail,
      fromName: provider.fromName,
      isDefault: provider.isDefault,
    });
    setSaveError(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Providers</h1>
          <p className="text-sm text-gray-500 mt-1">Configure SMTP, SendGrid or Mailgun.</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setForm(defaultForm); setSaveError(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Provider
        </button>
      </div>

      {testResult && (
        <div className={cn('p-4 rounded-lg text-sm', testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {testResult.success ? 'Test email sent successfully to your address!' : `Test failed: ${testResult.error ?? 'Unknown error'}`}
          <button onClick={() => setTestResult(null)} className="ml-4 underline">Dismiss</button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No email providers configured yet.</div>
      ) : (
        <div className="space-y-4">
          {providers.map((provider) => (
            <div key={provider.id} className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-gray-900">{provider.name}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_BADGES[provider.type])}>
                    {provider.type.toUpperCase()}
                  </span>
                  {provider.isDefault && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
                      <Star size={10} />
                      Default
                    </span>
                  )}
                  {!provider.isActive && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">
                  From: {provider.fromName} &lt;{provider.fromEmail}&gt;
                  {provider.host && <span className="ml-2">• {provider.host}:{provider.port}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => testMutation.mutate(provider.id)}
                  disabled={testMutation.isPending && testMutation.variables === provider.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <Send size={12} />
                  {testMutation.isPending && testMutation.variables === provider.id ? 'Sending...' : 'Test'}
                </button>
                <button
                  onClick={() => openEdit(provider)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <Pencil size={12} />
                  Edit
                </button>
                {!provider.isDefault && (
                  <button
                    onClick={() => setDefaultMutation.mutate(provider.id)}
                    disabled={setDefaultMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <Star size={12} />
                    Set Default
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Delete "${provider.name}"?`)) deleteMutation.mutate(provider.id);
                  }}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Add Email Provider</h2>
            <ProviderForm form={form} setForm={setForm} />
            {saveError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{saveError}</div>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowAdd(false); setSaveError(null); }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.name.trim() || !form.fromEmail.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving...' : 'Save Provider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Edit — {editProvider.name}</h2>
            <ProviderForm form={form} setForm={setForm} />
            {saveError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{saveError}</div>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setEditProvider(null); setSaveError(null); }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => editMutation.mutate({ id: editProvider.id, data: form })}
                disabled={editMutation.isPending || !form.name.trim() || !form.fromEmail.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {editMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
