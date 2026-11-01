'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  MessageSquare,
  Send,
  Bell,
  Globe,
  BellOff,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChannelPreference {
  id: string;
  channel: string;
  messageType: string;
  status: string;
  consentAt: string | null;
  unsubscribedAt: string | null;
}

// ── Channel metadata ───────────────────────────────────────────────────────────

const CHANNELS: {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
}[] = [
  { key: 'EMAIL', label: 'Email', icon: Mail, description: 'Marketing emails and newsletters' },
  { key: 'SMS', label: 'SMS', icon: MessageSquare, description: 'Text message updates' },
  { key: 'TELEGRAM', label: 'Telegram', icon: Send, description: 'Telegram bot notifications' },
  { key: 'WEB_PUSH', label: 'Web Push', icon: Globe, description: 'Browser push notifications' },
  { key: 'IN_APP', label: 'In-App', icon: Bell, description: 'Notifications inside the dashboard' },
];

const MESSAGE_TYPES = [
  { key: 'MARKETING', label: 'Marketing' },
  { key: 'TRANSACTIONAL', label: 'Transactional' },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CommunicationPreferencesPage() {
  const queryClient = useQueryClient();

  const { data: prefsData, isLoading } = useQuery<ChannelPreference[]>({
    queryKey: ['channel-preferences'],
    queryFn: async () => {
      const res = await api().get<{ data: ChannelPreference[] } | ChannelPreference[]>(
        '/communications/preferences',
      );
      const raw = res.data as { data?: ChannelPreference[] } | ChannelPreference[];
      return (raw as { data?: ChannelPreference[] }).data ?? (raw as ChannelPreference[]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      channel,
      messageType,
      status,
    }: {
      channel: string;
      messageType: string;
      status: string;
    }) => {
      await api().patch('/communications/preferences', { channel, messageType, status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-preferences'] });
    },
  });

  const prefs = prefsData ?? [];

  const getStatus = (channel: string, type: string): string => {
    const pref = prefs.find((p) => p.channel === channel && p.messageType === type);
    return pref?.status ?? 'subscribed';
  };

  const toggle = (channel: string, messageType: string, currentStatus: string) => {
    const newStatus = currentStatus === 'subscribed' ? 'unsubscribed' : 'subscribed';
    updateMutation.mutate({ channel, messageType, status: newStatus });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Communication Preferences</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage which types of messages you receive on each channel
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Note:</strong> Transactional messages (OTPs, order confirmations, system alerts)
        may still be sent even when opted out, as required by your account agreement.
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading preferences...</div>
      ) : (
        <div className="space-y-4">
          {CHANNELS.map((ch) => {
            const Icon = ch.icon;
            return (
              <div key={ch.key} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Icon size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{ch.label}</h3>
                    <p className="text-xs text-gray-400">{ch.description}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {MESSAGE_TYPES.map((mt) => {
                    const status = getStatus(ch.key, mt.key);
                    const isOn = status === 'subscribed';
                    const isSuppressed = status === 'suppressed';

                    return (
                      <div
                        key={mt.key}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50"
                      >
                        <div className="flex items-center gap-2">
                          {isSuppressed ? (
                            <XCircle size={15} className="text-red-400" />
                          ) : isOn ? (
                            <CheckCircle2 size={15} className="text-green-500" />
                          ) : (
                            <BellOff size={15} className="text-gray-400" />
                          )}
                          <span className="text-sm text-gray-700">{mt.label}</span>
                          {isSuppressed && (
                            <span className="text-xs text-red-500 font-medium">(suppressed)</span>
                          )}
                        </div>
                        <button
                          onClick={() => !isSuppressed && toggle(ch.key, mt.key, status)}
                          disabled={isSuppressed || updateMutation.isPending}
                          className={cn(
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                            isSuppressed
                              ? 'bg-gray-200 cursor-not-allowed'
                              : isOn
                                ? 'bg-blue-600'
                                : 'bg-gray-200',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                              isOn ? 'translate-x-[18px]' : 'translate-x-[3px]',
                            )}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
