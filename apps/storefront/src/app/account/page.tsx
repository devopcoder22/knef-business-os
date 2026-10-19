'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Package, LogOut } from 'lucide-react';
import { useCustomerStore } from '@/stores/customer.store';
import { customerLogout } from '@/lib/api';

export default function AccountPage() {
  const router = useRouter();
  const { customer, accessToken, refreshToken, isAuthenticated, clearAuth } = useCustomerStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsub = useCustomerStore.persist.onFinishHydration(() => setHydrated(true));
    if (useCustomerStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace('/login?from=/account');
  }, [hydrated, isAuthenticated, router]);

  async function handleLogout() {
    if (accessToken && refreshToken) {
      await customerLogout(accessToken, refreshToken).catch(() => {});
    }
    clearAuth();
    router.push('/');
  }

  if (!hydrated || !customer) return null;

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
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
            <User size={24} className="text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-lg">
              {customer.firstName} {customer.lastName}
            </p>
            <p className="text-sm text-gray-500">{customer.email}</p>
          </div>
        </div>
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
      </div>
    </div>
  );
}
