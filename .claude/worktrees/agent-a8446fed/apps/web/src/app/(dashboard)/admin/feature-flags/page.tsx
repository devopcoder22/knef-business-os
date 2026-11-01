'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  rolloutPercent: number;
  updatedAt: string;
}

interface FlagsResponse {
  data: FeatureFlag[];
}

const FLAG_DESCRIPTIONS: Record<string, string> = {
  FEATURE_AI_ASSISTANT: 'Enable the AI-powered business assistant for queries, analysis, and automation',
  FEATURE_BANK_INTEGRATION: 'Connect bank accounts via Mono/Okra for automatic reconciliation',
  FEATURE_MARKETPLACE_SYNC: 'Sync product catalog and orders with Jumia, Konga, and other marketplaces',
  FEATURE_EMAIL_MARKETING: 'Send targeted email campaigns to customer segments',
  FEATURE_TELEGRAM: 'Receive business alerts and reports via Telegram bot',
  FEATURE_CALENDAR: 'Sync tasks and events with Google Calendar or Outlook',
  FEATURE_MULTI_LOCATION: 'Enable multi-location inventory tracking and reporting',
  FEATURE_ECOMMERCE_API: 'Expose a public REST API for storefront and PWA integration',
};

export default function FeatureFlagsPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();

  const canManage = hasPermission(PERMISSIONS.ADMIN.MANAGE_FEATURE_FLAGS);

  const { data, isLoading } = useQuery<FlagsResponse>({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const res = await api().get<FlagsResponse>('/feature-flags');
      return res.data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, isEnabled }: { key: string; isEnabled: boolean }) => {
      await api().patch(`/feature-flags/${key}`, { isEnabled });
    },
    onMutate: async ({ key, isEnabled }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['feature-flags'] });
      const previous = queryClient.getQueryData<FlagsResponse>(['feature-flags']);
      queryClient.setQueryData<FlagsResponse>(['feature-flags'], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((f) => (f.key === key ? { ...f, isEnabled } : f)),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['feature-flags'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Feature Flags</h1>
        <p className="text-gray-500 text-sm mt-1">
          Enable or disable platform features for your organization
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))
        ) : (
          data?.data.map((flag) => (
            <div
              key={flag.id}
              className="bg-white rounded-xl border border-gray-200 p-5 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 text-sm">{flag.name}</h3>
                  {flag.isEnabled && (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {FLAG_DESCRIPTIONS[flag.key] ?? flag.description ?? 'No description'}
                </p>
                <p className="text-xs text-gray-400 mt-2 font-mono">{flag.key}</p>
              </div>

              {/* Toggle */}
              <div className="flex-shrink-0">
                {toggleMutation.isPending && toggleMutation.variables?.key === flag.key ? (
                  <Loader2 size={20} className="animate-spin text-blue-500 mt-1" />
                ) : (
                  <button
                    onClick={() =>
                      canManage &&
                      toggleMutation.mutate({ key: flag.key, isEnabled: !flag.isEnabled })
                    }
                    disabled={!canManage}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      flag.isEnabled ? 'bg-blue-600' : 'bg-gray-300'
                    } ${!canManage ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    role="switch"
                    aria-checked={flag.isEnabled}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        flag.isEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
