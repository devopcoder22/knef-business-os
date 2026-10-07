'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react';
import { useCustomerStore } from '@/stores/customer.store';
import { getMyOrder } from '@/lib/api';
import { formatNGN } from '@/lib/utils';

interface OrderItem {
  id: string;
  product: { id: string; name: string; sku: string };
  variant: { id: string; name: string; sku: string } | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

interface OrderDetail {
  reference: string;
  status: string;
  currency: string;
  subtotal: string;
  deliveryFee: string;
  totalAmount: string;
  notes: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryPhone: string | null;
  createdAt: string;
  completedAt: string | null;
  items: OrderItem[];
}

export default function AccountOrderDetailPage() {
  const router = useRouter();
  const { reference } = useParams<{ reference: string }>();
  const { accessToken, isAuthenticated } = useCustomerStore();

  useEffect(() => {
    if (!isAuthenticated) router.replace(`/login?from=/account/orders/${reference}`);
  }, [isAuthenticated, reference, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-order', reference, accessToken],
    queryFn: () => getMyOrder(accessToken!, reference),
    enabled: !!accessToken && !!reference,
  });

  const order = data as OrderDetail | undefined;

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="bg-white rounded-xl border p-6 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-100 rounded w-1/3" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center">
        <Package size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Order not found</p>
        <Link href="/account/orders" className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-700">
          Back to orders
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/account" className="hover:text-gray-900">Account</Link>
        <ChevronRight size={14} />
        <Link href="/account/orders" className="hover:text-gray-900">Orders</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-mono">{order.reference}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Order Details</h1>
        <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">{order.status}</span>
      </div>

      <div className="grid gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Items Ordered</h2>
          <div className="divide-y divide-gray-50">
            {order.items.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.product.name}</p>
                  {item.variant && <p className="text-xs text-gray-400">{item.variant.name}</p>}
                  <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{formatNGN(item.totalPrice)}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatNGN(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Delivery</span>
              <span>{formatNGN(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>{formatNGN(order.totalAmount)}</span>
            </div>
          </div>
        </div>

        {order.deliveryAddress && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">Delivery Address</h2>
            <p className="text-sm text-gray-600">{order.deliveryAddress}</p>
            {order.deliveryCity && (
              <p className="text-sm text-gray-600">
                {order.deliveryCity}{order.deliveryState && `, ${order.deliveryState}`}
              </p>
            )}
            {order.deliveryPhone && <p className="text-sm text-gray-400 mt-1">{order.deliveryPhone}</p>}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Order Info</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Reference</span>
              <span className="font-mono text-gray-900">{order.reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Placed</span>
              <span className="text-gray-900">{new Date(order.createdAt).toLocaleString('en-NG')}</span>
            </div>
            {order.completedAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">Completed</span>
                <span className="text-gray-900">{new Date(order.completedAt).toLocaleString('en-NG')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
