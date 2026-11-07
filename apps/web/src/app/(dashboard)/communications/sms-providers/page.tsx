'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Eye, EyeOff, MessageSquare, CheckCircle, AlertCircle, Send, Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Setting { key: string; value: string; label: string; }
type Provider = 'termii' | 'brevo';

export default function SmsProvidersPage() {
  const qc = useQueryClient();

  // Active provider
  const [activeProvider, setActiveProvider] = useState<Provider>('termii');

  // Termii fields
  const [termiiApiKey, setTermiiApiKey] = useState('');
  const [termiiSenderId, setTermiiSenderId] = useState('');
  const [termiiBaseUrl, setTermiiBaseUrl] = useState('');
  const [showTermiiKey, setShowTermiiKey] = useState(false);

  // Brevo fields
  const [brevoApiKey, setBrevoApiKey] = useState('');
  const [brevoSenderId, setBrevoSenderId] = useState('');
  const [showBrevoKey, setShowBrevoKey] = useState(false);

  // UI state
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const { data } = useQuery<{ data: Setting[] }>({
    queryKey: ['sms-settings'],
    queryFn: async () => {
      const res = await api().get('/settings/sms');
      return (res.data as any).data ? res.data : res.data;
    },
  });

  useEffect(() => {
    if (data) {
      const settings = Array.isArray(data) ? data : (data as any).data ?? [];
      for (const s of settings) {
        if (s.key === 'sms.provider') setActiveProvider((s.value as Provider) || 'termii');
        if (s.key === 'sms.apiKey') setTermiiApiKey(s.value ?? '');
        if (s.key === 'sms.senderId') setTermiiSenderId(s.value ?? '');
        if (s.key === 'sms.baseUrl') setTermiiBaseUrl(s.value ?? '');
        if (s.key === 'sms.brevoApiKey') setBrevoApiKey(s.value ?? '');
        if (s.key === 'sms.brevoSenderId') setBrevoSenderId(s.value ?? '');
      }
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api().post('/settings/sms', {
        settings: [
          { key: 'sms.provider', value: activeProvider, label: 'Active SMS Provider' },
          { key: 'sms.apiKey', value: termiiApiKey, label: 'Termii API Key' },
          { key: 'sms.senderId', value: activeProvider === 'termii' ? termiiSenderId : brevoSenderId, label: 'SMS Sender ID' },
          { key: 'sms.baseUrl', value: termiiBaseUrl || 'https://v4.api.termii.com', label: 'Termii Base URL' },
          { key: 'sms.brevoApiKey', value: brevoApiKey, label: 'Brevo API Key' },
          { key: 'sms.brevoSenderId', value: brevoSenderId, label: 'Brevo Sender Name' },
        ],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: () => setError('Failed to save settings'),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post('/communications/sms/test', { phone: testPhone });
      return (res.data as any);
    },
    onSuccess: (d) => setTestResult(d?.message ?? 'SMS sent successfully'),
    onError: (e: any) => setTestResult(`Error: ${e?.response?.data?.message ?? 'Failed to send'}`),
  });

  const isConfigured = activeProvider === 'termii' ? termiiApiKey.trim().length > 0 : brevoApiKey.trim().length > 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SMS Providers</h1>
          <p className="text-sm text-gray-500 mt-1">Configure SMS gateway for OTP and campaign messages</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={14} />
          {saved ? 'Saved!' : saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Provider selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Active Provider</p>
        <div className="grid grid-cols-2 gap-3">
          {(['termii', 'brevo'] as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setActiveProvider(p)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border-2 font-medium text-sm transition-all capitalize',
                activeProvider === p
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center',
                activeProvider === p ? 'bg-blue-100' : 'bg-gray-100',
              )}>
                <MessageSquare size={16} className={activeProvider === p ? 'text-blue-600' : 'text-gray-400'} />
              </div>
              <div className="text-left">
                <p>{p === 'termii' ? 'Termii' : 'Brevo'}</p>
                <p className="text-xs font-normal text-gray-400">{p === 'termii' ? 'Nigeria gateway' : 'Global SMS'}</p>
              </div>
              {activeProvider === p && <CheckCircle size={16} className="ml-auto text-blue-600" />}
            </button>
          ))}
        </div>
      </div>

      {/* Termii config */}
      {activeProvider === 'termii' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <MessageSquare size={20} className="text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Termii</p>
                <p className="text-xs text-gray-400">Nigeria SMS Gateway (v4)</p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${termiiApiKey ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {termiiApiKey ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              {termiiApiKey ? 'Configured' : 'Not configured'}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Globe size={13} className="text-gray-400" /> Base URL
            </label>
            <input
              type="url"
              value={termiiBaseUrl}
              onChange={(e) => setTermiiBaseUrl(e.target.value)}
              placeholder="https://v4.api.termii.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">Default: <span className="font-mono">https://v4.api.termii.com</span></p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type={showTermiiKey ? 'text' : 'password'}
                value={termiiApiKey}
                onChange={(e) => setTermiiApiKey(e.target.value)}
                placeholder="Your Termii API key"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setShowTermiiKey(!showTermiiKey)} className="px-3 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                {showTermiiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Get from <span className="font-medium">app.termii.com → API Keys</span></p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sender ID</label>
            <input
              type="text"
              value={termiiSenderId}
              onChange={(e) => setTermiiSenderId(e.target.value)}
              placeholder="KNEF"
              maxLength={11}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-start gap-1.5 mt-1">
              <AlertCircle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-600">Sender IDs must be pre-approved by Termii. Register at Termii dashboard.</p>
            </div>
          </div>
        </div>
      )}

      {/* Brevo config */}
      {activeProvider === 'brevo' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <MessageSquare size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Brevo</p>
                <p className="text-xs text-gray-400">Transactional SMS (global)</p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${brevoApiKey ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {brevoApiKey ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              {brevoApiKey ? 'Configured' : 'Not configured'}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type={showBrevoKey ? 'text' : 'password'}
                value={brevoApiKey}
                onChange={(e) => setBrevoApiKey(e.target.value)}
                placeholder="xkeysib-..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setShowBrevoKey(!showBrevoKey)} className="px-3 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                {showBrevoKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Get from <span className="font-medium">app.brevo.com → SMTP & API → API Keys</span></p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sender Name</label>
            <input
              type="text"
              value={brevoSenderId}
              onChange={(e) => setBrevoSenderId(e.target.value)}
              placeholder="KNEF"
              maxLength={11}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Alphanumeric, max 11 characters. Must be approved by Brevo for Nigeria.</p>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            Brevo endpoint: <span className="font-mono">https://api.brevo.com/v3/transactionalSMS/sms</span>
          </div>
        </div>
      )}

      {/* Test SMS */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Send Test SMS</h2>
        <p className="text-xs text-gray-400">Will send via the currently active provider (<span className="font-medium capitalize">{activeProvider}</span>). Save first to apply provider changes.</p>
        <div className="flex gap-2">
          <input
            type="tel"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="+2348012345678"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => testMutation.mutate()}
            disabled={!testPhone || !isConfigured || testMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Send size={13} />
            {testMutation.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {testResult && (
          <p className={`text-sm ${testResult.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{testResult}</p>
        )}
        {!isConfigured && <p className="text-xs text-gray-400">Configure and save your {activeProvider === 'termii' ? 'Termii' : 'Brevo'} API key first.</p>}
      </div>
    </div>
  );
}
