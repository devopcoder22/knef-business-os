'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Star, Send, Shield } from 'lucide-react';
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

export default function EmailProvidersPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message?: string; error?: string } | null>(null);

  const { data: providers = [], isLoading } = useQuery<EmailProvider[]>({
    queryKey: ['email-providers'],
    queryFn: async () => {
      const res = await api().get<{ data: EmailProvider[] }>('/email-providers');
      return res.data.data ?? res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => {
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
        payload.password = data.password;
      } else {
        payload.apiKey = data.apiKey;
      }
      return api().post('/email-providers', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-providers'] });
      setShowModal(false);
      setForm(defaultForm);
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
      const res = await api().post<{ data: { success: boolean; error?: string } }>(`/email-providers/${id}/test`);
      return { id, ...(res.data.data ?? res.data) };
    },
    onSuccess: (data) => setTestResult(data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Providers</h1>
          <p className="text-sm text-gray-500 mt-1">Configure SMTP, SendGrid or Mailgun.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Provider
        </button>
      </div>

      {testResult && (
        <div className={cn('p-4 rounded-lg text-sm', testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {testResult.success ? 'Test email sent successfully!' : `Test failed: ${testResult.error}`}
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
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
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
                </div>
                <p className="text-sm text-gray-500">
                  From: {provider.fromName} &lt;{provider.fromEmail}&gt;
                  {provider.host && <span className="ml-2">• {provider.host}:{provider.port}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => testMutation.mutate(provider.id)}
                  disabled={testMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <Send size={12} />
                  Test
                </button>
                {!provider.isDefault && (
                  <button
                    onClick={() => setDefaultMutation.mutate(provider.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <Star size={12} />
                    Set Default
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(provider.id)}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Add Email Provider</h2>

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
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="secure"
                      checked={form.secure}
                      onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))}
                    />
                    <label htmlFor="secure" className="text-sm text-gray-700">Use TLS/SSL</label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.username}
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {(form.type === 'sendgrid' || form.type === 'mailgun') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <input
                    type="password"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.apiKey}
                    onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  />
                  {form.type === 'mailgun' && (
                    <p className="text-xs text-gray-400 mt-1">For Mailgun, use the Host field as your domain (e.g. mg.example.com)</p>
                  )}
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

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={form.isDefault}
                  onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                />
                <label htmlFor="isDefault" className="text-sm text-gray-700">Set as default provider</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setForm(defaultForm); }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving...' : 'Save Provider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
