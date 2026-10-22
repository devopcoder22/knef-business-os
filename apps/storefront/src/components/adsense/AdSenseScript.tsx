'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchStorefrontSettings } from '@/lib/api';

/**
 * Hardcoded mandatory exclusions. These routes will NEVER show AdSense
 * regardless of what is stored in settings.
 */
const MANDATORY_EXCLUDED_ROUTES = [
  '/cart',
  '/checkout',
  '/order',
  '/account',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

const PUBLISHER_ID_REGEX = /^ca-pub-\d+$/;

function isExcludedRoute(pathname: string, excludedRoutes: string[]): boolean {
  const allRoutes = [...new Set([...MANDATORY_EXCLUDED_ROUTES, ...excludedRoutes])];
  return allRoutes.some((route) => {
    // Exact match or sub-path match (e.g. /order matches /order/confirmation)
    return pathname === route || pathname.startsWith(`${route}/`);
  });
}

export function AdSenseScript() {
  const pathname = usePathname();

  const { data: settings } = useQuery({
    queryKey: ['storefront-settings'],
    queryFn: fetchStorefrontSettings,
    staleTime: 5 * 60 * 1000,
  });

  // Early returns: always check pathname against mandatory exclusions first,
  // before any settings are loaded, to prevent accidental rendering.
  if (isExcludedRoute(pathname, [])) {
    return null;
  }

  // Not yet loaded or adsense disabled
  if (!settings) return null;
  if (!settings.adsenseEnabled) return null;

  // Strict Publisher ID validation — must be ca-pub- followed by digits only
  const publisherId = settings.adsensePublisherId ?? '';
  if (!PUBLISHER_ID_REGEX.test(publisherId)) {
    return null;
  }

  // Check user-configured excluded routes (on top of mandatory ones)
  const excludedRoutes = settings.adsenseExcludedRoutes ?? [];
  if (isExcludedRoute(pathname, excludedRoutes)) {
    return null;
  }

  // All conditions passed — render the AdSense script
  return (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
