'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin,
  Plus,
  Trash2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface ShopifyConnection {
  id: string;
  displayName: string;
  externalAccountName: string | null;
}

interface ShopifyLocation {
  id: string;
  name: string;
  address?: string;
  isActive?: boolean;
}

interface KnefLocation {
  id: string;
  name: string;
  address?: string;
}

interface LocationMapping {
  id: string;
  locationId: string;
  shopifyLocationId: string;
  location: { id: string; name: string };
}

export default function ShopifyLocationsPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('connectionId'));
  const [form, setForm] = useState({ locationId: '', shopifyLocationId: '' });
  const [showForm, setShowForm] = useState(false);

  const { data: connectionsData } = useQuery<{ data: ShopifyConnection[] }>({
    queryKey: ['shopify-connections'],
    queryFn: async () => {
      const res = await api().get('/integrations/connections');
      const all = (res.data as any)?.data ?? res.data ?? [];
      const shopify = Array.isArray(all) ? all.filter((c: any) => c.provider === 'shopify') : [];
      return { data: shopify };
    },
  });

  const connections = connectionsData?.data ?? [];
  const connectionId = selectedId ?? connections[0]?.id ?? null;

  const { data: shopifyLocations, isLoading: loadingShopify } = useQuery<ShopifyLocation[]>({
    queryKey: ['shopify-locations', connectionId],
    queryFn: async () => {
      const res = await api().get(`/shopify/connections/${connectionId}/locations/shopify`);
      return (res.data as any)?.data ?? res.data ?? [];
    },
    enabled: !!connectionId,
  });

  const { data: mappingsData, isLoading: loadingMappings } = useQuery<LocationMapping[]>({
    queryKey: ['shopify-location-mappings', connectionId],
    queryFn: async () => {
      const res = await api().get(`/shopify/connections/${connectionId}/locations/mappings`);
      return (res.data as any)?.data ?? res.data ?? [];
    },
    enabled: !!connectionId,
  });

  const { data: knefLocationsData } = useQuery<{ data: KnefLocation[] }>({
    queryKey: ['locations-list'],
    queryFn: async () => {
      const res = await api().get('/locations?limit=100');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post(
        `/shopify/connections/${connectionId}/locations/mappings`,
        form,
      );
      return res.data;
    },
    onSuccess: () => {
      setShowForm(false);
      setForm({ locationId: '', shopifyLocationId: '' });
      queryClient.invalidateQueries({ queryKey: ['shopify-location-mappings', connectionId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      await api().delete(
        `/shopify/connections/${connectionId}/locations/mappings/${mappingId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopify-location-mappings', connectionId] });
    },
  });

  const mappings = mappingsData ?? [];
  const shopify = shopifyLocations ?? [];
  const knefLocations = knefLocationsData?.data ?? [];

  const mappedShopifyIds = new Set(mappings.map(m => m.shopifyLocationId));
  const unmappedShopify = shopify.filter(sl => !mappedShopifyIds.has(sl.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/integrations/shopify" className="text-gray-400 hover:text-gray-600 text-sm">Shopify</Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-700">Locations</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Location Mappings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Map KNEF warehouse locations to Shopify fulfillment locations
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={!connectionId}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <Plus size={16} /> Add Mapping
        </button>
      </div>

      {/* Connection selector */}
      {connections.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Store:</span>
          <select
            value={connectionId ?? ''}
            onChange={e => setSelectedId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {connections.map(c => (
              <option key={c.id} value={c.id}>{c.displayName ?? c.externalAccountName ?? c.id}</option>
            ))}
          </select>
        </div>
      )}

      {/* Add mapping modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Add Location Mapping</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KNEF Location</label>
                <select
                  value={form.locationId}
                  onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select KNEF location...</option>
                  {knefLocations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shopify Location</label>
                <select
                  value={form.shopifyLocationId}
                  onChange={e => setForm(f => ({ ...f, shopifyLocationId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Shopify location...</option>
                  {shopify.map(sl => (
                    <option key={sl.id} value={sl.id}>{sl.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {createMutation.isError && (
              <p className="mt-3 text-sm text-red-600">Failed to create mapping. Please try again.</p>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => { setShowForm(false); setForm({ locationId: '', shopifyLocationId: '' }); }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!form.locationId || !form.shopifyLocationId || createMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving…' : 'Save Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!connectionId ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <MapPin size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No Shopify connection. <Link href="/integrations/connections" className="text-blue-600 underline">Connect now</Link></p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current mappings */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">Active Mappings</h2>
            </div>
            {loadingMappings ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : mappings.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <MapPin size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No location mappings yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {mappings.map(m => {
                  const shopifyLoc = shopify.find(sl => sl.id === m.shopifyLocationId);
                  return (
                    <div key={m.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate">{m.location.name}</span>
                          <ChevronRight size={12} className="text-gray-300 shrink-0" />
                          <span className="text-sm text-gray-600 truncate">{shopifyLoc?.name ?? m.shopifyLocationId}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm('Remove this location mapping?')) {
                            deleteMutation.mutate(m.id);
                          }
                        }}
                        className="p-1.5 rounded border border-red-200 text-red-400 hover:bg-red-50 ml-3"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Shopify locations */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">Shopify Locations</h2>
            </div>
            {loadingShopify ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : shopify.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <AlertCircle size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No Shopify locations found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {shopify.map(sl => {
                  const isMapped = mappedShopifyIds.has(sl.id);
                  return (
                    <div key={sl.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{sl.name}</p>
                        {sl.address && <p className="text-xs text-gray-400">{sl.address}</p>}
                      </div>
                      {isMapped ? (
                        <span className="text-xs text-green-600 font-medium">Mapped</span>
                      ) : (
                        <span className="text-xs text-amber-500 font-medium">Unmapped</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
