'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle, Settings, RefreshCw, CheckCircle, AlertCircle, XCircle,
  Clock, Send, List, Phone, Wifi, WifiOff, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhatsAppConfig {
  id: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string | null;
  businessAccountName: string | null;
  status: string;
  webhookVerifiedAt: string | null;
  lastHealthCheckAt: string | null;
  qualityRating: string | null;
  messagingLimit: string | null;
  isActive: boolean;
  createdAt: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown;
  rejectionReason: string | null;
  lastSyncedAt: string | null;
  providerTemplateId: string | null;
}

interface OrderEventMapping {
  id: string;
  orderEvent: string;
  templateId: string;
  isActive: boolean;
  template: { id: string; name: string; language: string; status: string; category: string };
}

interface ConfigForm {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  appSecret: string;
  webhookVerifyToken: string;
  displayPhoneNumber: string;
  businessAccountName: string;
}

const defaultForm: ConfigForm = {
  phoneNumberId: '',
  businessAccountId: '',
  accessToken: '',
  appSecret: '',
  webhookVerifyToken: '',
  displayPhoneNumber: '',
  businessAccountName: '',
};

const STATUS_ORDER_EVENTS = [
  'ORDER_RECEIVED', 'PAYMENT_CONFIRMED', 'ORDER_CONFIRMED', 'ORDER_PROCESSING',
  'ORDER_READY', 'ORDER_DISPATCHED', 'ORDER_COMPLETED', 'ORDER_CANCELLED',
];

// ── Status badge helper ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    CONNECTED: { color: 'text-green-700 bg-green-50 border-green-200', icon: <CheckCircle className="w-3 h-3" /> },
    CONNECTING: { color: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: <Clock className="w-3 h-3" /> },
    DEGRADED: { color: 'text-orange-700 bg-orange-50 border-orange-200', icon: <AlertCircle className="w-3 h-3" /> },
    DISCONNECTED: { color: 'text-red-700 bg-red-50 border-red-200', icon: <XCircle className="w-3 h-3" /> },
    TOKEN_EXPIRED: { color: 'text-red-700 bg-red-50 border-red-200', icon: <XCircle className="w-3 h-3" /> },
    NOT_CONFIGURED: { color: 'text-slate-600 bg-slate-50 border-slate-200', icon: <WifiOff className="w-3 h-3" /> },
  };
  const { color, icon } = map[status] ?? map.NOT_CONFIGURED;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', color)}>
      {icon}
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function TemplateBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    APPROVED: 'text-green-700 bg-green-50 border-green-200',
    PENDING: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    REJECTED: 'text-red-700 bg-red-50 border-red-200',
    PAUSED: 'text-orange-700 bg-orange-50 border-orange-200',
    DISABLED: 'text-slate-600 bg-slate-50 border-slate-200',
    DRAFT: 'text-blue-700 bg-blue-50 border-blue-200',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', colors[status] ?? colors.DRAFT)}>
      {status}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const qc = useQueryClient();
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [form, setForm] = useState<ConfigForm>(defaultForm);
  const [activeTab, setActiveTab] = useState<'overview' | 'templates' | 'orders' | 'conversations'>('overview');
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const { data: config, isLoading } = useQuery<WhatsAppConfig | null>({
    queryKey: ['whatsapp-config'],
    queryFn: async () => {
      const res = await api().get<{ data: WhatsAppConfig | null }>('/communications/whatsapp/config');
      return res.data.data ?? null;
    },
  });

  const { data: templates = [] } = useQuery<WhatsAppTemplate[]>({
    queryKey: ['whatsapp-templates'],
    queryFn: async () => {
      const res = await api().get<{ data: WhatsAppTemplate[] }>('/communications/whatsapp/templates');
      return res.data.data ?? [];
    },
    enabled: activeTab === 'templates' || activeTab === 'orders',
  });

  const { data: orderMappings = [] } = useQuery<OrderEventMapping[]>({
    queryKey: ['whatsapp-order-mappings'],
    queryFn: async () => {
      const res = await api().get<{ data: OrderEventMapping[] }>('/communications/whatsapp/order-event-mappings');
      return res.data.data ?? [];
    },
    enabled: activeTab === 'orders',
  });

  const configureMutation = useMutation({
    mutationFn: (data: ConfigForm) => api().post('/communications/whatsapp/config', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-config'] });
      setShowConfigForm(false);
    },
  });

  const healthCheckMutation = useMutation({
    mutationFn: () => api().post('/communications/whatsapp/config/health-check'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-config'] }),
  });

  const syncMutation = useMutation({
    mutationFn: () => api().post<{ data: { synced: number } }>('/communications/whatsapp/templates/sync'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      setSyncResult(`Synced ${res.data.data?.synced ?? 0} templates from Meta`);
      setTimeout(() => setSyncResult(null), 4000);
    },
  });

  const setMappingMutation = useMutation({
    mutationFn: (dto: { orderEvent: string; templateId: string; isActive: boolean }) =>
      api().put('/communications/whatsapp/order-event-mappings', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-order-mappings'] }),
  });

  const approvedTemplates = templates.filter((t) => t.status === 'APPROVED');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">WhatsApp Commerce</h1>
            <p className="text-sm text-slate-500">Meta WhatsApp Business Cloud API</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <button
              onClick={() => healthCheckMutation.mutate()}
              disabled={healthCheckMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', healthCheckMutation.isPending && 'animate-spin')} />
              Health Check
            </button>
          )}
          <button
            onClick={() => {
              if (config) {
                setForm({
                  phoneNumberId: config.phoneNumberId,
                  businessAccountId: config.businessAccountId,
                  accessToken: '',
                  appSecret: '',
                  webhookVerifyToken: '',
                  displayPhoneNumber: config.displayPhoneNumber ?? '',
                  businessAccountName: config.businessAccountName ?? '',
                });
              }
              setShowConfigForm(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Settings className="w-3.5 h-3.5" />
            {config ? 'Reconfigure' : 'Configure'}
          </button>
        </div>
      </div>

      {/* Status Card */}
      {config ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Status</p>
              <StatusBadge status={config.status} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Phone Number</p>
              <p className="text-sm font-medium text-slate-900">{config.displayPhoneNumber ?? config.phoneNumberId}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Quality Rating</p>
              <p className="text-sm font-medium text-slate-900">{config.qualityRating ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Webhook</p>
              <p className="text-sm font-medium text-slate-900">
                {config.webhookVerifiedAt ? (
                  <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Verified</span>
                ) : (
                  <span className="text-slate-500">Not verified</span>
                )}
              </p>
            </div>
            {config.businessAccountName && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">Business Account</p>
                <p className="text-sm text-slate-700">{config.businessAccountName}</p>
              </div>
            )}
            {config.lastHealthCheckAt && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">Last Health Check</p>
                <p className="text-sm text-slate-700">{new Date(config.lastHealthCheckAt).toLocaleString()}</p>
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
            WABA ID: {config.businessAccountId} · Phone Number ID: {config.phoneNumberId}
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-800">
          <div className="flex items-start gap-3">
            <WifiOff className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">WhatsApp not configured</p>
              <p className="text-sm mt-1">
                Configure your Meta WhatsApp Business Cloud API credentials to enable order notifications and customer messaging.
                You need a WABA ID, Phone Number ID, and a System User access token from Meta Business Manager.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {config && (
        <>
          <div className="flex border-b border-slate-200 gap-1">
            {(['overview', 'templates', 'orders', 'conversations'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
                  activeTab === tab
                    ? 'border-green-600 text-green-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                {tab === 'orders' ? 'Order Notifications' : tab}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-medium mb-1">Webhook URL</p>
                <code className="font-mono text-xs bg-blue-100 px-2 py-1 rounded">
                  {typeof window !== 'undefined' ? window.location.origin.replace(':3000', ':4000') : 'https://your-api-domain'}/api/v1/public/whatsapp/webhook
                </code>
                <p className="mt-2 text-xs text-blue-700">
                  Configure this URL in your Meta App Dashboard → Webhooks → Subscribe to <strong>messages</strong> field.
                  Set your Verify Token to match what you configured above.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 space-y-2">
                <p className="font-medium text-slate-900">Quick Setup Checklist</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className={cn('w-4 h-4', config ? 'text-green-500' : 'text-slate-300')} />
                    Phone Number ID + WABA ID configured
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className={cn('w-4 h-4', config.webhookVerifiedAt ? 'text-green-500' : 'text-slate-300')} />
                    Webhook verified by Meta
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className={cn('w-4 h-4', templates.some(t => t.status === 'APPROVED') ? 'text-green-500' : 'text-slate-300')} />
                    At least one APPROVED template synced
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className={cn('w-4 h-4', orderMappings.some(m => m.isActive) ? 'text-green-500' : 'text-slate-300')} />
                    Order event → template mapping configured
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">{templates.length} template{templates.length !== 1 ? 's' : ''} synced</p>
                <div className="flex items-center gap-2">
                  {syncResult && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> {syncResult}
                    </span>
                  )}
                  <button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5', syncMutation.isPending && 'animate-spin')} />
                    Sync from Meta
                  </button>
                </div>
              </div>

              {templates.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <List className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p>No templates yet. Click "Sync from Meta" to fetch approved templates.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <div key={t.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                        onClick={() => setExpandedTemplate(expandedTemplate === t.id ? null : t.id)}
                      >
                        <div className="flex items-center gap-3">
                          <TemplateBadge status={t.status} />
                          <span className="text-sm font-medium text-slate-900">{t.name}</span>
                          <span className="text-xs text-slate-400">{t.language} · {t.category}</span>
                        </div>
                        {expandedTemplate === t.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </button>
                      {expandedTemplate === t.id && (
                        <div className="px-4 pb-3 border-t border-slate-100 pt-3 text-sm text-slate-600 space-y-1">
                          {t.rejectionReason && (
                            <p className="text-red-600 text-xs">Rejection reason: {t.rejectionReason}</p>
                          )}
                          {t.lastSyncedAt && (
                            <p className="text-xs text-slate-400">Last synced: {new Date(t.lastSyncedAt).toLocaleString()}</p>
                          )}
                          {t.providerTemplateId && (
                            <p className="text-xs text-slate-400 font-mono">Provider ID: {t.providerTemplateId}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Order Notifications Tab */}
          {activeTab === 'orders' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Map order lifecycle events to approved WhatsApp templates. Only APPROVED templates can be selected for active sending.
              </p>
              {STATUS_ORDER_EVENTS.map((event) => {
                const mapping = orderMappings.find((m) => m.orderEvent === event);
                return (
                  <div key={event} className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{event.replace(/_/g, ' ')}</p>
                      {mapping ? (
                        <p className="text-xs text-slate-500 mt-0.5">
                          → <span className="font-mono">{mapping.template.name}</span> ({mapping.template.language})
                          {' '}<TemplateBadge status={mapping.template.status} />
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-0.5">No template mapped</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        className="text-sm border border-slate-200 rounded px-2 py-1 text-slate-700"
                        value={mapping?.templateId ?? ''}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          setMappingMutation.mutate({
                            orderEvent: event,
                            templateId: e.target.value,
                            isActive: mapping?.isActive ?? true,
                          });
                        }}
                      >
                        <option value="">— select template —</option>
                        {approvedTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                        ))}
                      </select>
                      {mapping && (
                        <button
                          onClick={() => setMappingMutation.mutate({ orderEvent: event, templateId: mapping.templateId, isActive: !mapping.isActive })}
                          className={cn(
                            'px-2 py-1 text-xs rounded font-medium',
                            mapping.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                          )}
                        >
                          {mapping.isActive ? 'Active' : 'Disabled'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Conversations Tab */}
          {activeTab === 'conversations' && (
            <div className="text-center py-12 text-slate-500">
              <Phone className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>Conversation view available when inbound messages are received.</p>
              <p className="text-sm mt-1">Ensure webhook is verified and phone number is registered with Meta.</p>
            </div>
          )}
        </>
      )}

      {/* Config Modal */}
      {showConfigForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {config ? 'Reconfigure WhatsApp' : 'Configure WhatsApp'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                configureMutation.mutate(form);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number ID *</label>
                <input
                  type="text"
                  required
                  value={form.phoneNumberId}
                  onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
                  placeholder="e.g. 106540352242922"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp Business Account ID (WABA) *</label>
                <input
                  type="text"
                  required
                  value={form.businessAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, businessAccountId: e.target.value }))}
                  placeholder="e.g. 102290129340398"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  System User Access Token *
                  <span className="text-xs font-normal text-slate-400 ml-1">(server-side only, encrypted at rest)</span>
                </label>
                <input
                  type="password"
                  required
                  value={form.accessToken}
                  onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
                  placeholder="EAAxx..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  App Secret
                  <span className="text-xs font-normal text-slate-400 ml-1">(for webhook signature verification)</span>
                </label>
                <input
                  type="password"
                  value={form.appSecret}
                  onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Webhook Verify Token</label>
                <input
                  type="text"
                  value={form.webhookVerifyToken}
                  onChange={(e) => setForm((f) => ({ ...f, webhookVerifyToken: e.target.value }))}
                  placeholder="your-custom-verify-token"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Display Phone</label>
                  <input
                    type="text"
                    value={form.displayPhoneNumber}
                    onChange={(e) => setForm((f) => ({ ...f, displayPhoneNumber: e.target.value }))}
                    placeholder="+234..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                  <input
                    type="text"
                    value={form.businessAccountName}
                    onChange={(e) => setForm((f) => ({ ...f, businessAccountName: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
              {configureMutation.isError && (
                <p className="text-sm text-red-600">Configuration failed. Check credentials and try again.</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfigForm(false)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={configureMutation.isPending}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {configureMutation.isPending ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
