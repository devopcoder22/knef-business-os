'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PackageSearch, CheckCircle, Clock, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { fetchOrder } from '@/lib/api';
import { formatNGN, formatDate, cn } from '@/lib/utils';

const STATUS_DISPLAY: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  CONFIRMED: {
    label: 'Order Confirmed',
    color: 'text-blue-700 bg-blue-50',
    icon: Clock,
  },
  PROCESSING: {
    label: 'Processing',
    color: 'text-amber-700 bg-amber-50',
    icon: Clock,
  },
  COMPLETED: {
    label: 'Completed',
    color: 'text-green-700 bg-green-50',
    icon: CheckCircle,
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'text-red-700 bg-red-50',
    icon: XCircle,
  },
};

function OrderTrackContent() {
  const params = useSearchParams();
  const initialRef = params.get('ref') ?? '';
  const [reference, setReference] = useState(initialRef);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [queryRef, setQueryRef] = useState(initialRef);
  const [queryEmail, setQueryEmail] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['order', queryRef, queryEmail],
    queryFn: () => fetchOrder(queryRef, queryEmail),
    enabled: submitted && Boolean(queryRef) && Boolean(queryEmail),
    retry: false,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setQueryRef(reference.trim());
    setQueryEmail(email.trim());
    setSubmitted(true);
  }

  const order = data?.data;
  const statusInfo = order
    ? STATUS_DISPLAY[order.status] ?? {
        label: order.status,
        color: 'text-gray-700 bg-gray-50',
        icon: Clock,
      }
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-full bg-knef-primary/10 flex items-center justify-center mx-auto mb-4">
          <PackageSearch size={32} className="text-knef-primary" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Track Your Order</h1>
        <p className="text-gray-500 mt-2">
          Enter your order reference and the email address used when ordering.
        </p>
      </div>

      {/* Lookup form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-8"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Order Reference
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. WEB-20241005-ABCD"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="The email you provided when ordering"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-5 w-full flex items-center justify-center gap-2 py-3 bg-knef-primary text-white rounded-xl font-semibold hover:bg-opacity-90 transition-colors disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Looking up…
            </>
          ) : (
            'Track Order'
          )}
        </button>
      </form>

      {/* Error */}
      {submitted && isError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 text-sm">Order not found</p>
            <p className="text-red-600 text-xs mt-0.5">
              {(error as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message ??
                'Check your reference number and email address.'}
            </p>
          </div>
        </div>
      )}

      {/* Order result */}
      {order && statusInfo && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
          {/* Status header */}
          <div className={cn('px-6 py-5 flex items-center gap-3', statusInfo.color)}>
            <statusInfo.icon size={24} />
            <div>
              <p className="font-bold text-lg">{statusInfo.label}</p>
              <p className="text-sm opacity-80">
                Order placed {formatDate(order.createdAt)}
              </p>
            </div>
          </div>

          {/* Reference + total */}
          <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                Reference
              </p>
              <p className="font-mono font-bold text-gray-900">{order.reference}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total</p>
              <p className="font-bold text-knef-primary text-lg">
                {formatNGN(order.totalAmount)}
              </p>
            </div>
          </div>

          {/* Items */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Items
            </p>
            <div className="space-y-3">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start text-sm">
                  <div>
                    <p className="font-medium text-gray-900">
                      {item.product.name}
                      {item.variant ? ` — ${item.variant.name}` : ''}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {item.quantity} × {formatNGN(item.unitPrice)}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900 shrink-0 ml-4">
                    {formatNGN(item.totalPrice)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer CTA */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              Questions about your order? Contact us at{' '}
              <a
                href="mailto:info@knef.ng"
                className="text-knef-primary hover:underline"
              >
                info@knef.ng
              </a>{' '}
              or call{' '}
              <a
                href="tel:+2348000000000"
                className="text-knef-primary hover:underline"
              >
                +234 800 000 0000
              </a>
              .
            </p>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-gray-400 mt-8">
        Don&apos;t have your reference?{' '}
        <Link href="/products" className="text-knef-primary hover:underline">
          Continue shopping
        </Link>
      </p>
    </div>
  );
}

export default function OrderTrackPage() {
  return (
    <Suspense>
      <OrderTrackContent />
    </Suspense>
  );
}
