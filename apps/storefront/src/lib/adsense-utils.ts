/**
 * Pure utility functions for AdSense route-exclusion and publisher-ID validation.
 * Extracted from AdSenseScript component to enable deterministic unit testing
 * without a React rendering environment.
 */

export const PUBLISHER_ID_REGEX = /^ca-pub-\d+$/;

/**
 * Routes on which AdSense MUST NEVER load regardless of admin configuration.
 * Covers transactional, authentication, payment, and API paths.
 *
 * Matching is prefix-based: /checkout also blocks /checkout/payment, etc.
 */
export const MANDATORY_EXCLUDED_ROUTES = [
  '/cart',
  '/checkout',
  '/order',
  '/account',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/api',
] as const;

/**
 * Returns true if the given pathname must not receive AdSense script injection.
 *
 * A pathname is excluded when it either exactly matches an excluded prefix or starts
 * with that prefix followed by `/` (preventing partial-segment false-positives).
 * Query strings and fragments are not part of pathname and do not affect matching.
 */
export function isExcludedRoute(
  pathname: string,
  extraRoutes: string[] = [],
): boolean {
  const allRoutes = [...MANDATORY_EXCLUDED_ROUTES, ...extraRoutes];
  return allRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Returns true if the publisher ID matches the required ca-pub-DIGITS format.
 * Rejects empty strings, script tags, and any non-digit content after the prefix.
 */
export function isValidPublisherId(id: string): boolean {
  return PUBLISHER_ID_REGEX.test(id);
}

/**
 * Generates the canonical Google ads.txt line for a validated publisher ID.
 * Caller must validate the ID before calling this function.
 */
export function buildAdsTxtLine(publisherId: string): string {
  const numericId = publisherId.replace('ca-pub-', '');
  return `google.com, pub-${numericId}, DIRECT, f08c47fec0942fa0\n`;
}
