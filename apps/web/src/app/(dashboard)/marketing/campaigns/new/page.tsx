'use client';

import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const OBJECTIVES = [
  { value: 'PRODUCT_LAUNCH', label: 'Product Launch' },
  { value: 'PROMOTION', label: 'Promotion' },
  { value: 'CLEARANCE', label: 'Clearance' },
  { value: 'AWARENESS', label: 'Awareness' },
  { value: 'CUSTOMER_RETENTION', label: 'Customer Retention' },
  { value: 'ABANDONED_CART_RECOVERY', label: 'Abandoned Cart Recovery' },
  { value: 'SEASONAL_PROMOTION', label: 'Seasonal Promotion' },
  { value: 'NEW_ARRIVAL', label: 'New Arrival' },
  { value: 'EVENT', label: 'Event' },
  { value: 'RE_ENGAGEMENT', label: 'Re-engagement' },
  { value: 'GENERIC', label: 'Generic / Other' },
];

const CHANNELS = ['EMAIL', 'SMS', 'TELEGRAM', 'WHATSAPP', 'WEB_PUSH', 'SOCIAL'];

interface Segment { id: string; name: string }

export default function NewCampaignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    description: '',
    objective: 'GENERIC',
    channels: [] as string[],
    startDate: '',
    endDate: '',
    notes: '',
    targetSegmentId: '',
  });
  const [error, setError] = useState('');

  const { data: segments } = useQuery<{ items: Segment[]; total: number }>({
    queryKey: ['customer-segments'],
    queryFn: async () => {
      const res = await api().get<Segment[]>('/customers/segments');
      return { items: Array.isArray(res.data) ? res.data : [], total: 0 };
    },
  });

  const mutation = useMutation({
    mutationFn: async () =>
      api().post('/marketing/campaigns', {
        ...form,
        channels: form.channels,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        targetSegmentId: form.targetSegmentId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      router.push('/marketing/campaigns');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Failed to create campaign');
    },
  });

  const toggleChannel = (ch: string) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch],
    }));
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
        <p className="text-gray-500 text-sm mt-1">Create a marketing campaign to coordinate your content</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Black Friday 2026"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="Brief description of this campaign"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Objective</label>
          <select
            value={form.objective}
            onChange={(e) => setForm({ ...form, objective: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {OBJECTIVES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Channels</label>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => toggleChannel(ch)}
                className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${
                  form.channels.includes(ch)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience Segment</label>
          <select
            value={form.targetSegmentId}
            onChange={(e) => setForm({ ...form, targetSegmentId: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">No specific segment</option>
            {(segments?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Internal notes for the team"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name || mutation.isPending}
            className="px-6 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Campaign'}
          </button>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
