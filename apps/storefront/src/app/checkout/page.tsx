'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Package, Loader2, CheckCircle } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { useMutation } from '@tanstack/react-query';
import { createOrder } from '@/lib/api';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
import { useCartStore } from '@/stores/cart.store';
import { formatNGN, cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

const schema = z.object({
  customerName: z
    .string()
    .min(2, 'Full name is required')
    .max(100, 'Name is too long'),
  customerPhone: z
    .string()
    .min(7, 'Valid phone number required')
    .max(20, 'Phone number too long')
    .regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number'),
  customerEmail: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER']),
  notes: z.string().max(500, 'Notes too long').optional(),
});

type FormData = z.infer<typeof schema>;

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const totalAmount = useCartStore((s) => s.totalAmount());
  const clearCart = useCartStore((s) => s.clearCart);
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'CASH' },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      createOrder({
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail || undefined,
        paymentMethod: data.paymentMethod,
        notes: data.notes || undefined,
        idempotencyKey: crypto.randomUUID(),
        turnstileToken: turnstileToken ?? undefined,
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId ?? undefined,
          quantity: i.quantity,
        })),
      }),
    onSuccess: (res) => {
      const ref = res.data.reference;
      setOrderRef(ref);
      clearCart();
    },
    onError: (err: unknown) => {
      const e = err as { message?: string };
      toast('error', e?.message ?? 'Failed to place order. Please try again.');
    },
  });

  // Order success view
  if (orderRef) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Order Placed!</h1>
        <p className="text-gray-600 mb-2">
          Thank you for your order. Your reference number is:
        </p>
        <div className="inline-block px-4 py-2 rounded-lg bg-gray-100 font-mono text-lg font-bold text-gray-800 mb-8">
          {orderRef}
        </div>
        <p className="text-sm text-gray-500 mb-8">
          Keep this reference number. You can track your order status using it.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/order?ref=${orderRef}`}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-knef-primary text-white rounded-xl font-semibold hover:bg-opacity-90 transition-colors"
          >
            Track Order
          </Link>
          <Link
            href="/products"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  // Empty cart guard
  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <Package size={64} className="mx-auto text-gray-200 mb-6" />
        <h2 className="text-xl font-bold text-gray-900 mb-3">Your cart is empty</h2>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 px-6 py-3 bg-knef-primary text-white rounded-xl font-semibold"
        >
          Shop Products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back */}
      <Link
        href="/cart"
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-knef-primary mb-8 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Cart
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Form */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-5">Your Details</h2>
          <form
            id="checkout-form"
            onSubmit={handleSubmit((data) => mutation.mutate(data))}
            className="space-y-5"
          >
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                {...register('customerName')}
                type="text"
                placeholder="e.g. Amara Chukwu"
                className={cn(
                  'w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                  errors.customerName
                    ? 'border-red-300'
                    : 'border-gray-200',
                )}
              />
              {errors.customerName && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.customerName.message}
                </p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                {...register('customerPhone')}
                type="tel"
                placeholder="+234 800 000 0000"
                className={cn(
                  'w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                  errors.customerPhone
                    ? 'border-red-300'
                    : 'border-gray-200',
                )}
              />
              {errors.customerPhone && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.customerPhone.message}
                </p>
              )}
            </div>

            {/* Email (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address{' '}
                <span className="text-gray-400 font-normal">(optional — for order tracking)</span>
              </label>
              <input
                {...register('customerEmail')}
                type="email"
                placeholder="you@example.com"
                className={cn(
                  'w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                  errors.customerEmail
                    ? 'border-red-300'
                    : 'border-gray-200',
                )}
              />
              {errors.customerEmail && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.customerEmail.message}
                </p>
              )}
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'CASH', label: 'Cash on Delivery', sub: 'Pay when you receive your order' },
                  { value: 'BANK_TRANSFER', label: 'Bank Transfer', sub: 'Transfer before dispatch' },
                ] as const).map(({ value, label, sub }) => (
                  <label key={value} className="relative flex cursor-pointer rounded-xl border border-gray-200 p-3 hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition-colors">
                    <input
                      {...register('paymentMethod')}
                      type="radio"
                      value={value}
                      className="sr-only"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Order Notes{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                {...register('notes')}
                rows={3}
                placeholder="Delivery address, special instructions…"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary resize-none"
              />
            </div>

          </form>
        </div>

        {/* Order summary */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-5">Order Summary</h2>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {items.map((item) => (
                <div
                  key={`${item.productId}-${item.variantId}`}
                  className="flex items-center gap-3 p-4"
                >
                  <div className="w-14 h-14 rounded-lg bg-gray-50 shrink-0 overflow-hidden border border-gray-100">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={56}
                        height={56}
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={20} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">
                      {item.name}
                      {item.variantName ? ` — ${item.variantName}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Qty: {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 shrink-0">
                    {formatNGN(item.unitPrice * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 px-4 py-4">
              <div className="flex justify-between items-center font-bold text-lg">
                <span className="text-gray-900">Total</span>
                <span className="text-knef-primary">{formatNGN(totalAmount)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Payment collected on delivery / in store
              </p>
            </div>
          </div>

          {SITE_KEY && (
            <div className="mt-5">
              <Turnstile siteKey={SITE_KEY} onSuccess={setTurnstileToken} onError={() => setTurnstileToken(null)} onExpire={() => setTurnstileToken(null)} />
            </div>
          )}

          <button
            form="checkout-form"
            type="submit"
            disabled={mutation.isPending || (!!SITE_KEY && !turnstileToken)}
            className="mt-5 w-full flex items-center justify-center gap-2 py-4 bg-knef-primary text-white rounded-xl font-bold text-base hover:bg-opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Placing Order…
              </>
            ) : (
              'Place Order'
            )}
          </button>

          <p className="text-xs text-center text-gray-400 mt-3">
            By placing your order you agree to our{' '}
            <a href="/terms" className="underline hover:text-gray-600">terms</a>.
            No card details are collected online.
          </p>
        </div>
      </div>
    </div>
  );
}
