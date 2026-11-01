'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Activity, Copy, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface WebhookEndpoint {
  id: string;
  url: string;
  name: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  event: string;
  status: string;
  responseCode: number | null;
  attempts: number;
  createdAt: string;
}

interface CreateForm {
  url: string;
  name: string;
  events: string;
}

const defaultForm: CreateForm = {
  url: '',
  name: '',
  events: 'order.created,order.completed',
};

export default function WebhooksPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateForm>(defaultForm);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const { data: endpoints = [], isLoading } = useQuery<WebhookEndpoint[]>({
    queryKey: ['webhook-endpoints'],
    queryFn: async () => {
      const res = await api().get<{ data: WebhookEndpoint[] }>('/webhooks/endpoints');
      return res.data.data ?? res.data;
    },
  });

  const { data: deliveriesData } = useQuery<{ data: WebhookDelivery[] }>({
    queryKey: ['webhook-deliveries', selectedEndpoint],
    queryFn: async () => {
      const res = await api().get<{ data: { data: WebhookDelivery[] } }>(
        `/webhooks/endpoints/${selectedEndpoint}/deliveries`,
      );
      return res.data.data ?? res.data;
    },
    enabled: !!selectedEndpoint,
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateForm) => {
      const events = data.events
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
      const res = await api().post<{ data: WebhookEndpoint & { secret: string } }>(
        '/webhooks/endpoints',
        { url: data.url, name: data.name, events },
      );
      return res.data.data ?? res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      setShowModal(false);
      setForm(defaultForm);
      if (data && 'secret' in data) {
        setNewSecret((data as { secret: string }).secret);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api().delete(`/webhooks/endpoints/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-endpoints'] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api().post(`/webhooks/endpoints/${id}/test`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-deliveries', selectedEndpoint] }),
  });

  const copySecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret).catch(() => {});
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const deliveries = deliveriesData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-sm text-gray-500 mt-1">Receive real-time events from KNEF Business OS.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Endpoint
        </button>
      </div>

      {newSecret && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="font-semibold text-amber-900 mb-2">Signing Secret (shown once)</h3>
          <p className="text-sm text-amber-700 mb-3">
            Copy this secret now. You will not be able to see it again. Use it to verify webhook signatures.
          </p>
          <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
            <code className="flex-1 text-sm font-mono text-amber-800 break-all">{newSecret}</code>
            <button
              onClick={copySecret}
              className="flex-shrink-0 text-amber-600 hover:text-amber-800"
            >
              {copiedSecret ? 'Copied!' : <Copy size={15} />}
            </button>
          </div>
          <button onClick={() => setNewSecret(null)} className="text-xs text-amber-600 underline mt-2">
            I've saved the secret
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Endpoints list */}
        <div>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : endpoints.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No webhook endpoints yet.</div>
          ) : (
            <div className="space-y-3">
              {endpoints.map((endpoint) => (
                <div
                  key={endpoint.id}
                  className={cn(
                    'bg-white border rounded-xl p-4 cursor-pointer transition-colors',
                    selectedEndpoint === endpoint.id
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300',
                  )}
                  onClick={() => setSelectedEndpoint(endpoint.id === selectedEndpoint ? null : endpoint.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 text-sm">{endpoint.name}</span>
                        {endpoint.failureCount > 0 && (
                          <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">
                            {endpoint.failureCount} fails
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{endpoint.url}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {endpoint.events.map((event) => (
                          <span key={event} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                            {event}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); testMutation.mutate(endpoint.id); }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Send test"
                      >
                        <Activity size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(endpoint.id); }}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {endpoint.lastTriggeredAt && (
                    <p className="text-xs text-gray-400 mt-2">
                      Last triggered: {new Date(endpoint.lastTriggeredAt).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delivery log */}
        {selectedEndpoint && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Delivery Log</h3>
            </div>
            {deliveries.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No deliveries yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {deliveries.map((delivery) => (
                  <div key={delivery.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900">{delivery.event}</span>
                      <div className="flex items-center gap-2">
                        {delivery.responseCode && (
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded font-mono',
                            delivery.responseCode < 300
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700',
                          )}>
                            {delivery.responseCode}
                          </span>
                        )}
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          delivery.status === 'delivered'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700',
                        )}>
                          {delivery.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(delivery.createdAt).toLocaleString()} • {delivery.attempts} attempt(s)
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add Webhook Endpoint</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My webhook"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
                <input
                  type="url"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://myapp.com/webhooks/knef"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Events (comma separated)</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.events}
                  onChange={(e) => setForm((f) => ({ ...f, events: e.target.value }))}
                  placeholder="order.created, order.completed, *"
                />
                <p className="text-xs text-gray-400 mt-1">Use * to receive all events</p>
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
                disabled={createMutation.isPending || !form.url || !form.name}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Endpoint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
