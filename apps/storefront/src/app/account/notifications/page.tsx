'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bell } from 'lucide-react';
import { useCustomerStore } from '@/stores/customer.store';
import { PushNotificationManager } from '@/components/notifications/PushNotificationManager';

export default function NotificationsPage() {
  const router = useRouter();
  const { isAuthenticated } = useCustomerStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useCustomerStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useCustomerStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace('/login?from=/account/notifications');
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated) return <div className="min-h-[60vh]" />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/account" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Browser Push Notifications
          </h2>
          <PushNotificationManager />
          <p className="text-xs text-gray-400 mt-2">
            Push notifications require HTTPS and a supported browser. You can manage notification
            permissions at any time in your browser settings.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            What you'll receive
          </h2>
          <ul className="space-y-2">
            {[
              'Order confirmed',
              'Payment received',
              'Order dispatched',
              'Order delivered',
            ].map(item => (
              <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">
            <strong className="text-gray-700">Note:</strong> Browser notifications are separate from
            browser permissions. Granting browser permission only allows KNEF to send notifications —
            we will only send transactional updates about your orders.
          </p>
        </section>
      </div>
    </div>
  );
}
