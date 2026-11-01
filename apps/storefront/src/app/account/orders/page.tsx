'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react';
import { useCustomerStore } from '@/stores/customer.store';
import { getMyOrders } from '@/lib/api';
import { formatNGN } from '@/lib/utils';

export default function AccountOrdersPage() {
  const router = useRouter();
  const { accessToken, isAuthenticated } = useCustomerStore();

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login?from=/account/orders');
  }, [isAuthenticated, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders', accessToken],
    queryFn: () => getMyOrders(accessToken!),
    enabled: !!accessToken,
  });

  const orders = (data as { data?: unknown[] } | undefined)?.data ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/account" className="hover:text-gray-900">Account</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">My Orders</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Order History</h1>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Package size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No orders yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">When you place an order, it will appear here</p>
          <Link
            href="/products"
            className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(orders as Array<{
            reference: string;
            status: string;
            totalAmount: string;
            currency: string;
            itemCount: number;
            createdAt: string;
          }>).map((order) => (
            <Link
              key={order.reference}
              href={`/account/orders/${order.reference}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold text-gray-900">{order.reference}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })} · {order.itemCount} item{order.itemCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{formatNGN(order.totalAmount)}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                      {order.status}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
