'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Package, LogOut, MapPin, Bell, Pencil, X, Loader2 } from 'lucide-react';
import { useCustomerStore } from '@/stores/customer.store';
import { customerLogout, updateProfile } from '@/lib/api';
import { toast } from '@/components/ui/toast';

export default function AccountPage() {
  const router = useRouter();
  const { customer, accessToken, refreshToken, isAuthenticated, clearAuth, updateCustomer } = useCustomerStore();
  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (useCustomerStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useCustomerStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && (!isAuthenticated || !customer)) router.replace('/login?from=/account');
  }, [hydrated, isAuthenticated, customer, router]);

  function startEditing() {
    if (!customer) return;
    setFirstName(customer.firstName);
    setLastName(customer.lastName === '-' ? '' : customer.lastName);
    setNameError('');
    setEditing(true);
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      setNameError('Please enter both your first and last name');
      return;
    }
    setSavingName(true);
    setNameError('');
    try {
      const updated = await updateProfile(accessToken, { firstName: first, lastName: last });
      updateCustomer({ firstName: updated.firstName, lastName: updated.lastName });
      setEditing(false);
      toast('success', 'Your name has been updated');
    } catch (err) {
      setNameError((err as Error).message || 'Could not save your changes');
    } finally {
      setSavingName(false);
    }
  }

  async function handleLogout() {
    if (accessToken && refreshToken) {
      await customerLogout(accessToken, refreshToken).catch(() => {});
    }
    clearAuth();
    router.push('/');
  }

  if (!hydrated) return <div className="min-h-[60vh]" />;
  if (!customer) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        {editing ? (
          <form onSubmit={saveName} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Edit your name</h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                aria-label="Cancel editing"
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="first-name" className="block text-sm font-medium text-gray-700 mb-1">
                  First name
                </label>
                <input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={100}
                  autoComplete="given-name"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary"
                />
              </div>
              <div>
                <label htmlFor="last-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Last name
                </label>
                <input
                  id="last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={100}
                  autoComplete="family-name"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Email: <span className="text-gray-600">{customer.email}</span> (can&apos;t be changed here)
            </p>
            {nameError && <p className="text-sm text-red-600">{nameError}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingName}
                className="flex-1 sm:flex-none sm:px-6 flex items-center justify-center gap-2 py-2.5 bg-knef-primary text-white rounded-xl text-sm font-semibold hover:bg-opacity-90 disabled:opacity-60"
              >
                {savingName ? <Loader2 size={15} className="animate-spin" /> : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <User size={24} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-lg truncate">
                {customer.firstName} {customer.lastName === '-' ? '' : customer.lastName}
              </p>
              <p className="text-sm text-gray-500 truncate">{customer.email}</p>
            </div>
            <button
              type="button"
              onClick={startEditing}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-knef-primary border border-gray-200 rounded-xl hover:border-knef-primary transition-colors"
            >
              <Pencil size={14} />
              Edit
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/account/orders"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <Package size={24} className="text-blue-600 mb-3" />
          <p className="font-semibold text-gray-900 group-hover:text-blue-600">My Orders</p>
          <p className="text-sm text-gray-500 mt-1">View your order history and track deliveries</p>
        </Link>

        <Link
          href="/order"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <Package size={24} className="text-gray-400 mb-3" />
          <p className="font-semibold text-gray-900 group-hover:text-blue-600">Track an Order</p>
          <p className="text-sm text-gray-500 mt-1">Look up any order by reference number</p>
        </Link>

        <Link
          href="/account/addresses"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <MapPin size={24} className="text-green-600 mb-3" />
          <p className="font-semibold text-gray-900 group-hover:text-blue-600">My Addresses</p>
          <p className="text-sm text-gray-500 mt-1">Manage your saved delivery addresses</p>
        </Link>

        <Link
          href="/account/notifications"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <Bell size={24} className="text-purple-600 mb-3" />
          <p className="font-semibold text-gray-900 group-hover:text-blue-600">Notifications</p>
          <p className="text-sm text-gray-500 mt-1">Manage push notification preferences</p>
        </Link>
      </div>
    </div>
  );
}
