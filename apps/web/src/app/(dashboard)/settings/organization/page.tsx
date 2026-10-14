'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Save, Loader2, Building2, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface Organization {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  logoUrl: string | null;
  website: string | null;
  taxId: string | null;
  currency: string | null;
  timezone: string | null;
  _count: { locations: number; users: number };
}

interface Location {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  isDefault: boolean;
}

interface OrgResponse { data: Organization }
interface LocationsResponse { data: Location[] }

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
    </button>
  );
}

function IdField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <code className="flex-1 text-xs font-mono text-gray-700 truncate">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export default function OrganizationPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const canEdit = hasPermission(PERMISSIONS.SETTINGS.EDIT);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', city: '',
    state: '', country: '', website: '', taxId: '', currency: '', timezone: '',
  });
  const [saved, setSaved] = useState(false);

  const { data: orgData, isLoading: orgLoading } = useQuery<OrgResponse>({
    queryKey: ['organization'],
    queryFn: async () => {
      const res = await api().get<OrgResponse>('/organization');
      return res.data;
    },
  });

  const { data: locationsData, isLoading: locationsLoading } = useQuery<LocationsResponse>({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await api().get<LocationsResponse>('/locations');
      return res.data;
    },
  });

  useEffect(() => {
    if (orgData?.data) {
      const o = orgData.data;
      setForm({
        name: o.name ?? '',
        email: o.email ?? '',
        phone: o.phone ?? '',
        address: o.address ?? '',
        city: o.city ?? '',
        state: o.state ?? '',
        country: o.country ?? '',
        website: o.website ?? '',
        taxId: o.taxId ?? '',
        currency: o.currency ?? '',
        timezone: o.timezone ?? '',
      });
    }
  }, [orgData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== ''),
      );
      await api().patch('/organization', payload);
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });

  const org = orgData?.data;
  const locations = locationsData?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organization</h1>
        <p className="text-gray-500 text-sm mt-1">View your Organization ID, Location IDs, and update business details</p>
      </div>

      {/* IDs panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Building2 size={18} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">Identifiers</h2>
        </div>

        {orgLoading ? (
          <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ) : org ? (
          <div className="space-y-4">
            <IdField label="Organization ID" value={org.id} />

            <div>
              <div className="flex items-center gap-2 mb-3 mt-5">
                <MapPin size={15} className="text-gray-500" />
                <p className="text-sm font-semibold text-gray-700">Locations</p>
              </div>

              {locationsLoading ? (
                <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
              ) : locations.length === 0 ? (
                <p className="text-sm text-gray-400">No locations found</p>
              ) : (
                <div className="space-y-3">
                  {locations.map((loc) => (
                    <div key={loc.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-gray-900 text-sm">{loc.name}</span>
                        {loc.isDefault && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Default</span>
                        )}
                        {!loc.isActive && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                        )}
                      </div>
                      <IdField label="Location ID" value={loc.id} />
                      {loc.address && (
                        <p className="text-xs text-gray-400 mt-1">{loc.address}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Editable details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">Business Details</h2>
          {canEdit && (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                saved
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
              }`}
            >
              {saveMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {saved ? 'Saved!' : 'Save'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {([
            { key: 'name', label: 'Organization Name' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' },
            { key: 'website', label: 'Website' },
            { key: 'taxId', label: 'Tax ID / RC Number' },
            { key: 'currency', label: 'Currency' },
            { key: 'timezone', label: 'Timezone' },
            { key: 'address', label: 'Address', span: true },
            { key: 'city', label: 'City' },
            { key: 'state', label: 'State' },
            { key: 'country', label: 'Country' },
          ] as { key: keyof typeof form; label: string; span?: boolean }[]).map(({ key, label, span }) => (
            <div key={key} className={span ? 'md:col-span-2' : ''}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type="text"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                disabled={!canEdit}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
