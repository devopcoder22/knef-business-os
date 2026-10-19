'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Eye, EyeOff, MessageSquare, CheckCircle, AlertCircle, Send } from 'lucide-react';
import { api } from '@/lib/api';

interface Setting { key: string; value: string; label: string; }

export default function SmsProvidersPage() {
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [senderId, setSenderId] = useState('');
  const [showKey, setShowKey] = useState(false);
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
        if (s.key === 'sms.apiKey') setApiKey(s.value ?? '');
        if (s.key === 'sms.senderId') setSenderId(s.value ?? '');
      }
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api().post('/settings/sms', {
        settings: [
          { key: 'sms.apiKey', value: apiKey, label: 'Termii API Key' },
          { key: 'sms.senderId', value: senderId, label: 'SMS Sender ID' },
        ],
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sms-settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2500); },
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

  const isConfigured = apiKey.trim().length > 0;

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

      {/* Provider card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <MessageSquare size={20} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Termii</p>
              <p className="text-xs text-gray-400">Nigeria SMS Gateway</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isConfigured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {isConfigured ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
            {isConfigured ? 'Connected' : 'Not configured'}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Termii API key"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setShowKey(!showKey)} className="px-3 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Get your API key from <span className="font-medium">app.termii.com → API Keys</span></p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sender ID</label>
            <input
              type="text"
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              placeholder="KNEF"
              maxLength={11}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-start gap-1.5 mt-1">
              <AlertCircle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-600">Sender IDs must be pre-approved by Termii before use. Visit Termii dashboard to register your sender ID.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Test SMS */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Send Test SMS</h2>
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
        {!isConfigured && <p className="text-xs text-gray-400">Save your API key first to enable test SMS.</p>}
      </div>

      {/* Sample messages */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Message Templates</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p className="font-medium text-gray-700">OTP Verification:</p>
          <p className="bg-gray-50 rounded-lg p-3 font-mono text-xs">Your KNEF Gadgets verification code is {'{{code}}'}. Valid for 10 minutes.</p>
          <p className="font-medium text-gray-700 mt-3">Order Confirmation:</p>
          <p className="bg-gray-50 rounded-lg p-3 font-mono text-xs">Hi {'{{name}}'}, your order {'{{reference}}'} has been confirmed. Total: {'{{amount}}'}. We will notify you when it ships.</p>
        </div>
      </div>
    </div>
  );
}
