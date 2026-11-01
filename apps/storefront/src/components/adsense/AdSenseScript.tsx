'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchStorefrontSettings } from '@/lib/api';
import { isExcludedRoute, isValidPublisherId } from '@/lib/adsense-utils';

export function AdSenseScript() {
  const pathname = usePathname();

  // Always check pathname against mandatory exclusions first, before any
  // settings are loaded, to prevent accidental rendering on sensitive routes.
  if (isExcludedRoute(pathname, [])) {
    return null;
  }

  const { data: settings } = useQuery({
    queryKey: ['storefront-settings'],
    queryFn: fetchStorefrontSettings,
    staleTime: 5 * 60 * 1000,
  });

  if (!settings) return null;
  if (!settings.adsenseEnabled) return null;

  const publisherId = settings.adsensePublisherId ?? '';
  if (!isValidPublisherId(publisherId)) return null;

  const excludedRoutes = settings.adsenseExcludedRoutes ?? [];
  if (isExcludedRoute(pathname, excludedRoutes)) return null;

  return (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
