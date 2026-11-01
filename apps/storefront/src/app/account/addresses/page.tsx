'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Plus, Trash2, Star, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { useCustomerStore } from '@/stores/customer.store';
import {
  listSavedAddresses,
  createSavedAddress,
  deleteSavedAddress,
  setDefaultAddress,
  type SavedAddress,
} from '@/lib/api';
import { toast } from '@/components/ui/toast';

export default function AddressesPage() {
  const router = useRouter();
  const { accessToken, isAuthenticated } = useCustomerStore();
  const [hydrated, setHydrated] = useState(false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAddress, setNewAddress] = useState({
    addressLine1: '',
    addressLine2: '',
    landmark: '',
    city: '',
    state: '',
    country: 'Nigeria',
    phone: '',
    label: '',
    isDefault: false,
  });

  useEffect(() => {
    if (useCustomerStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useCustomerStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace('/login?from=/account/addresses');
  }, [hydrated, isAuthenticated, router]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    listSavedAddresses(accessToken)
      .then(setAddresses)
      .catch(() => toast('error', 'Failed to load addresses'))
      .finally(() => setLoading(false));
  }, [hydrated, accessToken]);

  async function handleDelete(id: string) {
    if (!accessToken) return;
    try {
      await deleteSavedAddress(accessToken, id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      toast('success', 'Address deleted');
    } catch {
      toast('error', 'Failed to delete address');
    }
  }

  async function handleSetDefault(id: string) {
    if (!accessToken) return;
    try {
      const updated = await setDefaultAddress(accessToken, id);
      setAddresses((prev) =>
        prev.map((a) => ({ ...a, isDefault: a.id === updated.id })),
      );
      toast('success', 'Default address updated');
    } catch {
      toast('error', 'Failed to update default address');
    }
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !newAddress.addressLine1.trim()) return;
    setSaving(true);
    try {
      const created = await createSavedAddress(accessToken, {
        ...newAddress,
        addressSource: 'MANUAL',
      });
      setAddresses((prev) => [...prev, created]);
      setShowAdd(false);
      setNewAddress({ addressLine1: '', addressLine2: '', landmark: '', city: '', state: '', country: 'Nigeria', phone: '', label: '', isDefault: false });
      toast('success', 'Address saved');
    } catch (err) {
      toast('error', (err as { message?: string }).message ?? 'Failed to save address');
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) return <div className="min-h-[60vh]" />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/account" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Saved Addresses</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-gray-300" />
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {addresses.length === 0 && !showAdd && (
              <div className="text-center py-12 text-gray-400">
                <MapPin size={40} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm">No saved addresses yet.</p>
              </div>
            )}
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className="bg-white border border-gray-100 rounded-xl p-4 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-knef-primary mt-0.5 shrink-0" />
                  <div>
                    {addr.label && (
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                        {addr.label}
                      </p>
                    )}
                    <p className="text-sm text-gray-900">{addr.addressLine1}</p>
                    {addr.addressLine2 && <p className="text-sm text-gray-600">{addr.addressLine2}</p>}
                    {addr.landmark && (
                      <p className="text-xs text-gray-400 mt-0.5">Landmark: {addr.landmark}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[addr.city, addr.state, addr.country].filter(Boolean).join(', ')}
                    </p>
                    {addr.isDefault && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-green-600 font-medium">
                        <CheckCircle size={12} />
                        Default
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!addr.isDefault && (
                    <button
                      onClick={() => handleSetDefault(addr.id)}
                      title="Set as default"
                      className="p-1.5 text-gray-400 hover:text-yellow-500 transition-colors"
                    >
                      <Star size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(addr.id)}
                    title="Delete address"
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showAdd ? (
            <form onSubmit={handleAddSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-gray-900 mb-1">New Address</h3>
              <input
                type="text"
                placeholder="Label (e.g. Home, Office)"
                value={newAddress.label}
                onChange={(e) => setNewAddress((p) => ({ ...p, label: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <input
                type="text"
                placeholder="Street address *"
                required
                value={newAddress.addressLine1}
                onChange={(e) => setNewAddress((p) => ({ ...p, addressLine1: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <input
                type="text"
                placeholder="Apartment, floor, suite (optional)"
                value={newAddress.addressLine2}
                onChange={(e) => setNewAddress((p) => ({ ...p, addressLine2: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <input
                type="text"
                placeholder="Landmark (optional, helps delivery driver)"
                value={newAddress.landmark}
                onChange={(e) => setNewAddress((p) => ({ ...p, landmark: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="City"
                  value={newAddress.city}
                  onChange={(e) => setNewAddress((p) => ({ ...p, city: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                />
                <input
                  type="text"
                  placeholder="State"
                  value={newAddress.state}
                  onChange={(e) => setNewAddress((p) => ({ ...p, state: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAddress.isDefault}
                  onChange={(e) => setNewAddress((p) => ({ ...p, isDefault: e.target.checked }))}
                  className="rounded"
                />
                Set as default delivery address
              </label>
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-knef-primary text-white rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : 'Save Address'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-knef-primary hover:text-knef-primary transition-colors"
            >
              <Plus size={16} />
              Add new address
            </button>
          )}
        </>
      )}
    </div>
  );
}
