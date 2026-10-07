'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Mail,
  MessageSquare,
  Webhook,
  Calendar,
  Globe,
  ArrowRight,
  CheckCircle,
  HardDrive,
} from 'lucide-react';
import { api } from '@/lib/api';

interface AIProvider {
  id: string;
  name: string;
  model: string;
  isActive: boolean;
  isDefault: boolean;
}

interface Integration {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

interface IntegrationsResponse {
  data: Integration[];
}

interface ProvidersResponse {
  data: AIProvider[];
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          Manage <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
      {active ? 'Connected' : 'Inactive'}
    </span>
  );
}

const COMM_CHANNELS = [
  {
    label: 'Email',
    icon: Mail,
    href: '/communications/email-providers',
    desc: 'Resend, SendGrid and other providers',
  },
  {
    label: 'Telegram',
    icon: MessageSquare,
    href: '/communications/telegram',
    desc: 'Bot notifications and alerts',
  },
  {
    label: 'Webhooks',
    icon: Webhook,
    href: '/communications/webhooks',
    desc: 'Outbound webhook integrations',
  },
];

export default function IntegrationsPage() {
  const { data: providers, isLoading: providersLoading } = useQuery<ProvidersResponse>({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const res = await api().get<ProvidersResponse>('/ai/providers');
      return res.data;
    },
  });

  const { data: integrations, isLoading: integrationsLoading } = useQuery<IntegrationsResponse>({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await api().get<IntegrationsResponse>('/integrations');
      return res.data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-500 text-sm mt-1">
          Overview of all connected services and platform integrations
        </p>
      </div>

      {/* AI Providers */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <SectionHeader title="AI Providers" href="/ai/providers" />
        {providersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !providers?.data?.length ? (
          <p className="text-sm text-gray-400">No AI providers configured.</p>
        ) : (
          <div className="space-y-2">
            {providers.data.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Bot size={14} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.model}</p>
                  </div>
                  {p.isDefault && (
                    <span className="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">
                      Default
                    </span>
                  )}
                </div>
                <StatusBadge active={p.isActive} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Marketplace Integrations */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <SectionHeader title="Marketplace" href="/ecommerce" />
        {integrationsLoading ? (
          <div className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ) : !integrations?.data?.length ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 border border-dashed border-gray-200">
            <Globe size={20} className="text-gray-300" />
            <div>
              <p className="text-sm font-medium text-gray-500">
                No marketplace integrations configured
              </p>
              <p className="text-xs text-gray-400">
                Connect Jumia, Konga, or other marketplaces via the E-commerce section.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {integrations.data.map((integration) => (
              <div
                key={integration.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <Globe size={16} className="text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{integration.name}</p>
                    <p className="text-xs text-gray-400">{integration.type}</p>
                  </div>
                </div>
                <StatusBadge active={integration.isActive} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Communication Channels */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <SectionHeader title="Communication" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {COMM_CHANNELS.map((ch) => (
            <Link
              key={ch.href}
              href={ch.href}
              className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0">
                <ch.icon size={16} className="text-gray-600 group-hover:text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                  {ch.label}
                </p>
                <p className="text-xs text-gray-400">{ch.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <SectionHeader title="Calendar" href="/calendar/settings" />
        <Link
          href="/calendar/settings"
          className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group w-full"
        >
          <div className="w-9 h-9 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center">
            <Calendar size={16} className="text-gray-600 group-hover:text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
              Calendar Connections
            </p>
            <p className="text-xs text-gray-400">Google Calendar & Microsoft 365 sync</p>
          </div>
          <ArrowRight size={14} className="text-gray-300 group-hover:text-blue-500" />
        </Link>
      </div>

      {/* Backup */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
              <HardDrive size={16} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Backup & Export</p>
              <p className="text-xs text-gray-400">Automated backup configuration</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Not Configured
          </span>
        </div>
      </div>
    </div>
  );
}
