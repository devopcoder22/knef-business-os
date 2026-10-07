'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type SearchEntityType =
  | 'PRODUCT'
  | 'CUSTOMER'
  | 'ORDER'
  | 'INVOICE'
  | 'STAFF'
  | 'SUPPLIER'
  | 'TRANSACTION'
  | 'SERIALIZED_UNIT'
  | 'TASK';

export interface SearchResult {
  type: SearchEntityType;
  id: string;
  title: string;
  subtitle: string;
  route: string;
  metadata?: Record<string, string>;
}

export interface GlobalSearchResponse {
  query: string;
  total: number;
  results: SearchResult[];
  byType: Partial<Record<SearchEntityType, SearchResult[]>>;
}

interface Options {
  q: string;
  types?: SearchEntityType[];
  limit?: number;
  enabled?: boolean;
}

export function useGlobalSearch({ q, types, limit = 5, enabled = true }: Options) {
  const trimmed = q.trim();
  const shouldFetch = enabled && trimmed.length >= 2;

  return useQuery<GlobalSearchResponse>({
    queryKey: ['global-search', trimmed, types?.join(',') ?? '', limit],
    enabled: shouldFetch,
    staleTime: 15_000,
    gcTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ q: trimmed, limit: String(limit) });
      if (types && types.length > 0) params.set('types', types.join(','));
      const res = await api().get<{ data: GlobalSearchResponse }>(`/search?${params}`);
      return res.data.data;
    },
  });
}
