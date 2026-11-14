'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Plus, Trash2, Star, ArrowLeft, Loader2, CheckCircle, Pencil } from 'lucide-react';
import { useCustomerStore } from '@/stores/customer.store';
import {
  listSavedAddresses,
  createSavedAddress,
  updateSavedAddress,
  deleteSavedAddress,
  setDefaultAddress,
  type SavedAddress,
} from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

type AddressForm = {
  label: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  isDefault: boolean;
};

const EMPTY_FORM: AddressForm = {
  label: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  country: 'Nigeria',
  phone: '',
  isDefault: false,
};

function toForm(a: SavedAddress): AddressForm {
  return {
    label: a.label ?? '',
    addressLine1: a.addressLine1 ?? '',
    addressLine2: a.addressLine2 ?? '',
    landmark: a.landmark ?? '',
    city: a.city ?? '',
    state: a.state ?? '',
    country: a.country || 'Nigeria',
    phone: a.phone ?? '',
    isDefault: !!a.isDefault,
  };
}

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-knef-primary';

export default function AddressesPage() {
  const router = useRouter();
  const { accessToken, isAuthenticated } = useCustomerStore();
  const [hydrated, setHydrated] = useState(false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  // null = form closed, 'new' = adding, otherwise the id being edited
  const [formMode, setFormMode] = useState<null | 'new' | string>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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
      .then((list) => setAddresses(Array.isArray(list) ? list : []))
      .catch(() => toast('error', 'Failed to load addresses'))
      .finally(() => setLoading(false));
  }, [hydrated, accessToken]);

  function set<K extends keyof AddressForm>(key: K, value: AddressForm[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setFormMode('new');
  }

  function openEdit(addr: SavedAddress) {
    setForm(toForm(addr));
    setFormMode(addr.id);
  }

  function closeForm() {
    setFormMode(null);
    setForm(EMPTY_FORM);
  }

  async function handleDelete(id: string) {
    if (!accessToken) return;
    if (!window.confirm('Delete this address?')) return;
    try {
      await deleteSavedAddress(accessToken, id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      if (formMode === id) closeForm();
      toast('success', 'Address deleted');
    } catch {
      toast('error', 'Failed to delete address');
    }
  }

  async function handleSetDefault(id: string) {
    if (!accessToken) return;
    try {
      const updated = await setDefaultAddress(accessToken, id);
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === updated.id })));
      toast('success', 'Default address updated');
    } catch {
      toast('error', 'Failed to update default address');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !formMode) return;
    if (!form.addressLine1.trim()) {
      toast('error', 'Please enter the street address');
      return;
    }
    setSaving(true);
    try {
      if (formMode === 'new') {
        const created = await createSavedAddress(accessToken, { ...form, addressSource: 'MANUAL' });
        setAddresses((prev) => [
          ...(created.isDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev),
          created,
        ]);
        toast('success', 'Address saved');
      } else {
        const updated = await updateSavedAddress(accessToken, formMode, { ...form, addressSource: 'MANUAL' });
        setAddresses((prev) =>
          prev.map((a) =>
            a.id === updated.id ? updated : updated.isDefault ? { ...a, isDefault: false } : a,
          ),
        );
        toast('success', 'Address updated');
      }
      closeForm();
    } catch (err) {
      toast('error', (err as { message?: string }).message ?? 'Failed to save address');
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) return <div className="min-h-[60vh]" />;

  const addressForm = (
    <form onSubmit={handleSubmit} className="bg-white border border-knef-primary/30 rounded-xl p-5 space-y-3 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-1">{formMode === 'new' ? 'New Address' : 'Edit Address'}</h3>
      <input
        type="text"
        placeholder="Label (e.g. Home, Office)"
        value={form.label}
        maxLength={50}
        onChange={(e) => set('label', e.target.value)}
        className={inputClass}
      />
      <input
        type="text"
        placeholder="Street address *"
        required
        maxLength={200}
        value={form.addressLine1}
        onChange={(e) => set('addressLine1', e.target.value)}
        className={inputClass}
      />
      <input
        type="text"
        placeholder="Apartment, floor, suite (optional)"
        maxLength={200}
        value={form.addressLine2}
        onChange={(e) => set('addressLine2', e.target.value)}
        className={inputClass}
      />
      <input
        type="text"
        placeholder="Landmark (optional, helps the delivery driver)"
        maxLength={200}
        value={form.landmark}
        onChange={(e) => set('landmark', e.target.value)}
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="City / LGA"
          maxLength={100}
          value={form.city}
          onChange={(e) => set('city', e.target.value)}
          className={inputClass}
        />
        {form.country === 'Nigeria' ? (
          <select value={form.state} onChange={(e) => set('state', e.target.value)} className={inputClass}>
            <option value="">Select state…</option>
            {/* Keep a previously saved non-standard value selectable */}
            {form.state && !NIGERIAN_STATES.includes(form.state) && <option value={form.state}>{form.state}</option>}
            {NIGERIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            placeholder="State / Region"
            maxLength={100}
            value={form.state}
            onChange={(e) => set('state', e.target.value)}
            className={inputClass}
          />
        )}
      </div>
      <input
        type="tel"
        placeholder="Delivery contact phone (optional)"
        maxLength={20}
        value={form.phone}
        onChange={(e) => set('phone', e.target.value)}
        className={inputClass}
      />
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => set('isDefault', e.target.checked)}
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
          {saving ? <Loader2 size={15} className="animate-spin" /> : formMode === 'new' ? 'Save Address' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={closeForm}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );

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
            {addresses.length === 0 && formMode !== 'new' && (
              <div className="text-center py-12 text-gray-400">
                <MapPin size={40} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm">No saved addresses yet.</p>
              </div>
            )}
            {addresses.map((addr) =>
              formMode === addr.id ? (
                <div key={addr.id}>{addressForm}</div>
              ) : (
                <div
                  key={addr.id}
                  className={cn(
                    'bg-white border rounded-xl p-4 flex items-start justify-between gap-3',
                    addr.isDefault ? 'border-green-200' : 'border-gray-100',
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <MapPin size={18} className="text-knef-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      {addr.label && (
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                          {addr.label}
                        </p>
                      )}
                      <p className="text-sm text-gray-900">{addr.addressLine1}</p>
                      {addr.addressLine2 && <p className="text-sm text-gray-600">{addr.addressLine2}</p>}
                      {addr.landmark && <p className="text-xs text-gray-400 mt-0.5">Landmark: {addr.landmark}</p>}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[addr.city, addr.state, addr.country].filter(Boolean).join(', ')}
                      </p>
                      {addr.phone && <p className="text-xs text-gray-500 mt-0.5">Phone: {addr.phone}</p>}
                      {addr.isDefault && (
                        <span className="inline-flex items-center gap-1 mt-1 text-xs text-green-600 font-medium">
                          <CheckCircle size={12} />
                          Default
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(addr)}
                      title="Edit address"
                      aria-label="Edit address"
                      className="p-1.5 text-gray-400 hover:text-knef-primary transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    {!addr.isDefault && (
                      <button
                        onClick={() => handleSetDefault(addr.id)}
                        title="Set as default"
                        aria-label="Set as default"
                        className="p-1.5 text-gray-400 hover:text-yellow-500 transition-colors"
                      >
                        <Star size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(addr.id)}
                      title="Delete address"
                      aria-label="Delete address"
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>

          {formMode === 'new' ? (
            addressForm
          ) : (
            <button
              onClick={openNew}
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
