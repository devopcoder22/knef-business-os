'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, XCircle, Clock } from 'lucide-react';
import { verifyPaystackPayment } from '@/lib/api';
import { useCartStore } from '@/stores/cart.store';
import { useCustomerStore } from '@/stores/customer.store';

type State =
  | { kind: 'checking' }
  | { kind: 'paid'; orderReference?: string }
  | { kind: 'pending'; orderReference?: string }
  | { kind: 'failed'; orderReference?: string; message?: string };

/**
 * Paystack's hosted payment page sends the customer here as
 * /checkout/payment-return?trxref=<ref>&reference=<ref>. We never trust the query string:
 * the API verifies the reference with Paystack before the order is confirmed.
 */
function PaymentReturn() {
  const params = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref') ?? '';
  const clearCart = useCartStore((s) => s.clearCart);
  const isAuthenticated = useCustomerStore((s) => s.isAuthenticated);
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    if (!reference) {
      setState({ kind: 'failed', message: 'No payment reference was provided.' });
      return;
    }
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        try {
          const res = await verifyPaystackPayment(reference);
          if (res.data.status === 'paid') {
            clearCart();
            if (!cancelled) setState({ kind: 'paid', orderReference: res.data.orderReference });
            return;
          }
          if (res.data.status === 'failed') {
            if (!cancelled) setState({ kind: 'failed', orderReference: res.data.orderReference });
            return;
          }
          if (attempt === 4 && !cancelled) setState({ kind: 'pending', orderReference: res.data.orderReference });
        } catch (err) {
          if (!cancelled) setState({ kind: 'failed', message: (err as Error).message });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reference, clearCart]);

  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      {state.kind === 'checking' && (
        <>
          <Loader2 size={48} className="mx-auto text-knef-primary animate-spin mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Confirming your payment…</h1>
          <p className="text-gray-500">This usually takes a few seconds. Please don&apos;t close this page.</p>
        </>
      )}

      {state.kind === 'paid' && (
        <>
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Payment received!</h1>
          <p className="text-gray-600 mb-4">Thank you — your order is confirmed. We&apos;ve sent you a confirmation.</p>
          {state.orderReference && (
            <div className="inline-block px-4 py-2 rounded-lg bg-gray-100 font-mono text-lg font-bold text-gray-800 mb-8">
              {state.orderReference}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isAuthenticated && (
              <Link href="/account/orders" className="px-6 py-3 bg-knef-primary text-white rounded-xl font-semibold">
                View my orders
              </Link>
            )}
            <Link
              href="/products"
              className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50"
            >
              Continue Shopping
            </Link>
          </div>
        </>
      )}

      {state.kind === 'pending' && (
        <>
          <Clock size={48} className="mx-auto text-amber-500 mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Waiting for confirmation</h1>
          <p className="text-gray-600 mb-6">
            Paystack hasn&apos;t confirmed your payment yet. If you completed it, your order
            {state.orderReference ? ` ${state.orderReference}` : ''} will be confirmed automatically and you&apos;ll
            get a confirmation message.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-knef-primary text-white rounded-xl font-semibold"
          >
            Check again
          </button>
        </>
      )}

      {state.kind === 'failed' && (
        <>
          <XCircle size={48} className="mx-auto text-red-500 mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment not completed</h1>
          <p className="text-gray-600 mb-6">
            {state.message ??
              `Your payment did not go through${state.orderReference ? ` for order ${state.orderReference}` : ''}. You have not been charged for a failed payment.`}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/checkout" className="px-6 py-3 bg-knef-primary text-white rounded-xl font-semibold">
              Back to checkout
            </Link>
            <Link
              href="/contact"
              className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50"
            >
              Contact us
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <Loader2 size={48} className="mx-auto text-knef-primary animate-spin" />
        </div>
      }
    >
      <PaymentReturn />
    </Suspense>
  );
}
