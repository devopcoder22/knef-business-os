'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { StorefrontSettings } from '@/lib/api';

export function Providers({
  children,
  initialSettings,
}: {
  children: React.ReactNode;
  /** Storefront settings loaded by the server layout; seeds the shared ['storefront-settings'] query. */
  initialSettings?: StorefrontSettings | null;
}) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          retry: 1,
        },
      },
    });
    // Header, footer, home page and AdSense all read this query; seeding it means the first
    // render already has the admin-configured details (no placeholder flash on refresh).
    if (initialSettings) client.setQueryData(['storefront-settings'], initialSettings);
    return client;
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
