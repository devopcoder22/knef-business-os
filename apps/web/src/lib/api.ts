'use client';

import { publicApiClient } from './api-client';
import { createApiClient } from './api-client';

// Lazy init — the real client is created once auth store is available
let _apiClient: ReturnType<typeof createApiClient> | null = null;

export function getApiClient() {
  if (_apiClient) return _apiClient;

  // Dynamic import to avoid circular dependency
  const { useAuthStore } = require('@/stores/auth.store') as typeof import('@/stores/auth.store');

  const getToken = () => useAuthStore.getState().accessToken;

  const refreshFn = async (): Promise<string | null> => {
    try {
      const res = await publicApiClient.post<{ data: { accessToken: string } }>(
        '/auth/refresh',
      );
      const newToken = res.data.data.accessToken;
      useAuthStore.getState().updateToken(newToken);
      return newToken;
    } catch {
      return null;
    }
  };

  const onUnauthorized = () => {
    useAuthStore.getState().clearAuth();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  _apiClient = createApiClient(getToken, refreshFn, onUnauthorized);
  return _apiClient;
}

export function api() {
  return getApiClient();
}

export { publicApiClient };
