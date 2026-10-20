'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Users, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  isAuto: boolean;
  criteria: Record<string, unknown>;
  _count: { members: number };
}

interface ReachData { total: number; consented: number }

const CHANNELS = ['EMAIL', 'SMS', 'TELEGRAM', 'WHATSAPP', 'WEB_PUSH'];

export default function AudiencesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reachChannel, setReachChannel] = useState('EMAIL');

  const { data: segments, isLoading } = useQuery<Segment[]>({
    queryKey: ['marketing-audiences'],
    queryFn: async () => {
      const res = await api().get<Segment[]>('/marketing/audiences');
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const { data: reach, isLoading: reachLoading } = useQuery<ReachData>({
    queryKey: ['marketing-audience-reach', selectedId, reachChannel],
    enabled: !!selectedId,
    queryFn: async () => {
      const res = await api().get<ReachData>(
        `/marketing/audiences/${selectedId}/reach?channel=${reachChannel}`,
      );
      return res.data;
    },
  });

  const selected = (segments ?? []).find((s) => s.id === selectedId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audiences</h1>
        <p className="text-gray-500 text-sm mt-1">Customer segments for targeting marketing campaigns</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        Audience reach estimates filter by marketing consent (Phase 24B channel preferences). Only consented recipients are counted.
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading segments...</div>
      ) : (segments ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
          <Users size={32} className="text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">No audience segments found</p>
          <p className="text-gray-400 text-xs mt-1">Create customer segments in the CRM module</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-2">
            {(segments ?? []).map((seg) => (
              <button
                key={seg.id}
                onClick={() => setSelectedId(seg.id === selectedId ? null : seg.id)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  selectedId === seg.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{seg.name}</span>
                      {seg.isAuto && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Auto</span>
                      )}
                    </div>
                    {seg.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{seg.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-gray-700">{seg._count.members}</span>
                    <ChevronRight size={15} className="text-gray-400" />
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
                <Users size={24} className="mb-2" />
                Select a segment to see reach
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{selected.name}</p>
                  <p className="text-xs text-gray-400">{selected._count.members} total members</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Estimate Reach For</label>
                  <select
                    value={reachChannel}
                    onChange={(e) => setReachChannel(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
                  >
                    {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                  </select>
                </div>

                {reachLoading ? (
                  <p className="text-xs text-gray-400">Estimating...</p>
                ) : reach ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total</span>
                      <span className="font-bold">{reach.total}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Consented</span>
                      <span className="font-bold text-green-600">{reach.consented}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: reach.total > 0 ? `${Math.round((reach.consented / reach.total) * 100)}%` : '0%' }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 text-right">
                      {reach.total > 0 ? Math.round((reach.consented / reach.total) * 100) : 0}% consent rate
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
