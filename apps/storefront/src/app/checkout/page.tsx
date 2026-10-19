'use client';

import { useState, useRef, useCallback } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowLeft, Package, Loader2, CheckCircle, ShieldCheck, MapPin } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { useMutation } from '@tanstack/react-query';
import {
  createOrder,
  requestEmailOtp,
  verifyEmailOtp,
  postOrderRegister,
} from '@/lib/api';
import type { AuthResult } from '@/lib/api';
import { useCartStore } from '@/stores/cart.store';
import { formatNGN, cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? '';

const schema = z.object({
  customerName: z.string().min(2, 'Full name is required').max(100, 'Name is too long'),
  customerPhone: z
    .string()
    .min(7, 'Valid phone number required')
    .max(20, 'Phone number too long')
    .regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number'),
  customerEmail: z.string().email('Valid email required'),
  deliveryAddress: z.string().min(5, 'Delivery address is required'),
  deliveryCity: z.string().optional(),
  deliveryState: z.string().optional(),
  deliveryPhone: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'PAYSTACK']),
  notes: z.string().max(500, 'Notes too long').optional(),
});

type FormData = z.infer<typeof schema>;
type OtpStep = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

declare global {
  interface Window {
    PaystackPop?: {
      setup(options: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        ref: string;
        metadata?: Record<string, unknown>;
        onClose: () => void;
        callback: (response: { reference: string }) => void;
      }): { openIframe: () => void };
    };
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: { componentRestrictions?: { country: string }; fields?: string[] },
          ) => {
            addListener: (event: string, handler: () => void) => void;
            getPlace: () => {
              formatted_address?: string;
              address_components?: Array<{ long_name: string; types: string[] }>;
            };
          };
        };
      };
    };
  }
}

export default function CheckoutPage() {
  const items = useCartStore((s) => s.items);
  const totalAmount = useCartStore((s) => s.totalAmount());
  const clearCart = useCartStore((s) => s.clearCart);

  const [step, setStep] = useState<'form' | 'success'>('form');
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [formSnapshot, setFormSnapshot] = useState<FormData | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');

  // Email OTP
  const [emailOtpStep, setEmailOtpStep] = useState<OtpStep>('idle');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpError, setEmailOtpError] = useState('');

  // Post-order account creation
  const [showRegister, setShowRegister] = useState(true);
  const [regPassword, setRegPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'CASH' },
  });

  const watchEmail = useWatch({ control, name: 'customerEmail' });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchEmail ?? '');

  // Google Maps Places autocomplete
  const initAutocomplete = useCallback(() => {
    if (!addressInputRef.current || !window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      componentRestrictions: { country: 'ng' },
      fields: ['formatted_address', 'address_components'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (place.formatted_address) {
        setValue('deliveryAddress', place.formatted_address, { shouldValidate: true });
      }
      const comps = place.address_components ?? [];
      const city =
        comps.find((c) => c.types.includes('locality'))?.long_name ??
        comps.find((c) => c.types.includes('administrative_area_level_2'))?.long_name ??
        '';
      const state = comps.find((c) => c.types.includes('administrative_area_level_1'))?.long_name ?? '';
      if (city) setValue('deliveryCity', city);
      if (state) setValue('deliveryState', state);
    });
  }, [setValue]);

  // Email OTP
  async function sendEmailOtp() {
    setEmailOtpStep('sending');
    setEmailOtpError('');
    try {
      await requestEmailOtp(getValues('customerEmail'));
      setEmailOtpStep('sent');
      toast('success', 'Email verification code sent');
    } catch (err) {
      setEmailOtpError((err as { message?: string }).message ?? 'Failed to send email code');
      setEmailOtpStep('idle');
    }
  }

  async function verifyEmail() {
    setEmailOtpStep('verifying');
    setEmailOtpError('');
    try {
      await verifyEmailOtp(getValues('customerEmail'), emailOtp);
      setEmailOtpStep('verified');
      toast('success', 'Email verified');
    } catch (err) {
      setEmailOtpError((err as { message?: string }).message ?? 'Invalid code. Try again.');
      setEmailOtpStep('sent');
    }
  }

  const placeMutation = useMutation({
    mutationFn: (payload: FormData & { paystackReference?: string }) =>
      createOrder({
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerEmail: payload.customerEmail,
        deliveryAddress: payload.deliveryAddress,
        deliveryCity: payload.deliveryCity,
        deliveryState: payload.deliveryState,
        deliveryPhone: payload.deliveryPhone,
        paymentMethod: payload.paymentMethod,
        paystackReference: payload.paystackReference,
        notes: payload.notes || undefined,
        idempotencyKey: crypto.randomUUID(),
        turnstileToken: turnstileToken ?? undefined,
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId ?? undefined,
          quantity: i.quantity,
        })),
      }),
    onSuccess: (res) => {
      setOrderRef(res.data.reference);
      clearCart();
      setStep('success');
    },
    onError: (err: unknown) => {
      setSubmitError((err as { message?: string })?.message ?? 'Failed to place order. Please try again.');
    },
  });

  async function onSubmit(data: FormData) {
    setSubmitError('');
    if (emailOtpStep === 'sent' || emailOtpStep === 'verifying') {
      setSubmitError('Please verify your email address before placing the order');
      return;
    }
    setFormSnapshot(data);

    if (data.paymentMethod === 'PAYSTACK') {
      if (!window.PaystackPop) {
        setSubmitError('Paystack is still loading. Please wait a moment and try again.');
        return;
      }
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: data.customerEmail,
        amount: Math.round(totalAmount * 100), // kobo
        currency: 'NGN',
        ref: `KNEF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        metadata: { customerName: data.customerName, customerPhone: data.customerPhone },
        onClose: () => {
          setSubmitError('Payment cancelled. Your order was not placed.');
        },
        callback: async (response) => {
          await placeMutation.mutateAsync({ ...data, paystackReference: response.reference });
        },
      });
      handler.openIframe();
      return;
    }

    await placeMutation.mutateAsync(data);
  }

  async function handlePostOrderRegister() {
    if (!formSnapshot || !orderRef) return;
    if (!regPassword || regPassword.length < 8) {
      setRegError('Password must be at least 8 characters');
      return;
    }
    setRegLoading(true);
    setRegError('');
    try {
      const nameParts = formSnapshot.customerName.trim().split(' ');
      const firstName = nameParts[0] ?? formSnapshot.customerName;
      const lastName = nameParts.slice(1).join(' ') || '-';
      await postOrderRegister({
        orderReference: orderRef,
        email: formSnapshot.customerEmail,
        password: regPassword,
        firstName,
        lastName,
        phone: formSnapshot.customerPhone,
      });
      setRegistered(true);
    } catch (err) {
      setRegError((err as { message?: string })?.message ?? 'Failed to create account. Try registering separately.');
    } finally {
      setRegLoading(false);
    }
  }

  // ── Empty cart guard ───────────────────────────────────────────────────────
  if (items.length === 0 && step === 'form') {
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

  // ── Success screen ─────────────────────────────────────────────────────────
  if (step === 'success' && orderRef && formSnapshot) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Order Placed!</h1>
          <p className="text-gray-600 mb-2">
            Thank you for your order. Your reference number is:
          </p>
          <div className="inline-block px-4 py-2 rounded-lg bg-gray-100 font-mono text-lg font-bold text-gray-800 mb-4">
            {orderRef}
          </div>
          <p className="text-sm text-gray-500">
            Keep this reference number. You can track your order status using it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {/* Track order */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-knef-primary/10 flex items-center justify-center">
              <Package size={20} className="text-knef-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Track Your Order</h3>
              <p className="text-sm text-gray-500">Check your order status and updates in real time.</p>
            </div>
            <Link
              href={`/order?ref=${orderRef}&email=${encodeURIComponent(formSnapshot.customerEmail)}`}
              className="mt-auto inline-flex items-center gap-1.5 px-4 py-2.5 bg-knef-primary text-white rounded-xl text-sm font-semibold hover:bg-opacity-90 transition-colors"
            >
              Track Order Status →
            </Link>
          </div>

          {/* Create account */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <ShieldCheck size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Save Your Order History</h3>
              <p className="text-sm text-gray-500">Create a free account to track all your orders in one place.</p>
            </div>

            {registered ? (
              <div className="mt-auto text-sm text-green-700 font-medium flex items-center gap-1.5">
                <CheckCircle size={16} />
                Account created!{' '}
                <Link href="/account" className="underline hover:no-underline">
                  Go to my account →
                </Link>
              </div>
            ) : showRegister ? (
              <div className="mt-auto space-y-3">
                <p className="text-xs text-gray-500">
                  Account email: <strong className="text-gray-700">{formSnapshot.customerEmail}</strong>
                </p>
                <input
                  type="password"
                  placeholder="Create a password (min 8 chars)"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                />
                {regError && <p className="text-xs text-red-600">{regError}</p>}
                <button
                  onClick={handlePostOrderRegister}
                  disabled={regLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {regLoading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Creating Account…
                    </>
                  ) : (
                    'Create Account'
                  )}
                </button>
                <button
                  onClick={() => setShowRegister(false)}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  No thanks
                </button>
              </div>
            ) : (
              <p className="mt-auto text-sm text-gray-400">
                You can{' '}
                <Link href="/register" className="text-blue-600 hover:underline">
                  register later
                </Link>{' '}
                at any time.
              </p>
            )}
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  // Address field — merge react-hook-form ref with our Maps ref
  const addressField = register('deliveryAddress');

  // ── Checkout form ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {PAYSTACK_PUBLIC_KEY && (
        <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />
      )}
      {MAPS_KEY && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places`}
          onLoad={initAutocomplete}
          strategy="lazyOnload"
        />
      )}

      <Link
        href="/cart"
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-knef-primary mb-8 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Cart
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* ── Left: Form ── */}
        <div className="space-y-8">
          <form id="checkout-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* ── Contact Details ── */}
            <div>
              <h2 className="font-semibold text-gray-900 mb-4">Contact Details</h2>

              {/* Full Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('customerName')}
                  type="text"
                  placeholder="e.g. Amara Chukwu"
                  className={cn(
                    'w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                    errors.customerName ? 'border-red-300' : 'border-gray-200',
                  )}
                />
                {errors.customerName && (
                  <p className="mt-1 text-xs text-red-600">{errors.customerName.message}</p>
                )}
              </div>

              {/* Phone */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('customerPhone')}
                  type="tel"
                  placeholder="+234 800 000 0000"
                  className={cn(
                    'w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                    errors.customerPhone ? 'border-red-300' : 'border-gray-200',
                  )}
                />
                {errors.customerPhone && (
                  <p className="mt-1 text-xs text-red-600">{errors.customerPhone.message}</p>
                )}
              </div>

              {/* Email + inline OTP */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    {...register('customerEmail')}
                    type="email"
                    placeholder="you@example.com"
                    disabled={emailOtpStep === 'verified'}
                    className={cn(
                      'flex-1 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                      errors.customerEmail ? 'border-red-300' : 'border-gray-200',
                      emailOtpStep === 'verified' && 'bg-green-50 border-green-300',
                    )}
                  />
                  {emailOtpStep === 'verified' ? (
                    <div className="flex items-center gap-1.5 px-3 text-green-600 text-sm font-medium shrink-0">
                      <CheckCircle size={16} />
                      Verified
                    </div>
                  ) : emailValid && emailOtpStep === 'idle' ? (
                    <button
                      type="button"
                      onClick={sendEmailOtp}
                      className="shrink-0 px-4 py-3 bg-gray-800 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
                    >
                      Send Code
                    </button>
                  ) : emailOtpStep === 'sending' ? (
                    <div className="shrink-0 flex items-center px-4 text-gray-400 text-sm">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Required for order confirmation and tracking
                </p>
                {errors.customerEmail && (
                  <p className="mt-1 text-xs text-red-600">{errors.customerEmail.message}</p>
                )}

                {/* Email code input */}
                {(emailOtpStep === 'sent' || emailOtpStep === 'verifying') && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit email code"
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-knef-primary"
                    />
                    <button
                      type="button"
                      onClick={verifyEmail}
                      disabled={emailOtp.length < 6 || emailOtpStep === 'verifying'}
                      className="shrink-0 px-4 py-2.5 bg-knef-primary text-white text-sm font-medium rounded-xl hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {emailOtpStep === 'verifying' ? <Loader2 size={16} className="animate-spin" /> : 'Verify'}
                    </button>
                  </div>
                )}
                {emailOtpError && <p className="mt-1 text-xs text-red-600">{emailOtpError}</p>}
                {emailOtpStep === 'sent' && (
                  <button
                    type="button"
                    onClick={sendEmailOtp}
                    className="mt-1 text-xs text-blue-600 hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>

            {/* ── Delivery Address ── */}
            <div>
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin size={16} className="text-knef-primary" />
                Delivery Address
              </h2>

              {/* Street address with Google Maps autocomplete */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  {...addressField}
                  ref={(el) => {
                    addressField.ref(el);
                    addressInputRef.current = el;
                  }}
                  type="text"
                  placeholder={MAPS_KEY ? 'Start typing your address…' : 'e.g. 15 Broad Street, Lagos'}
                  className={cn(
                    'w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                    errors.deliveryAddress ? 'border-red-300' : 'border-gray-200',
                  )}
                  autoComplete="off"
                />
                {MAPS_KEY && (
                  <p className="mt-1 text-xs text-gray-400">Start typing — select from suggestions</p>
                )}
                {errors.deliveryAddress && (
                  <p className="mt-1 text-xs text-red-600">{errors.deliveryAddress.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    {...register('deliveryCity')}
                    type="text"
                    placeholder="e.g. Lagos"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    {...register('deliveryState')}
                    type="text"
                    placeholder="e.g. Lagos State"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Contact Phone{' '}
                  <span className="text-gray-400 font-normal">(if different from above)</span>
                </label>
                <input
                  {...register('deliveryPhone')}
                  type="tel"
                  placeholder="+234 800 000 0000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors"
                />
              </div>
            </div>

            {/* ── Payment Method ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'CASH', label: 'Cash on Delivery', sub: 'Pay when you receive your order' },
                  { value: 'BANK_TRANSFER', label: 'Bank Transfer', sub: 'Transfer before dispatch' },
                  ...(PAYSTACK_PUBLIC_KEY ? [{ value: 'PAYSTACK' as const, label: 'Pay with Card', sub: 'Debit/credit card via Paystack' }] : []),
                ] as const).map(({ value, label, sub }) => (
                  <label
                    key={value}
                    className="relative flex cursor-pointer rounded-xl border border-gray-200 p-3 hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition-colors"
                  >
                    <input {...register('paymentMethod')} type="radio" value={value} className="sr-only" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* ── Notes ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Order Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                {...register('notes')}
                rows={3}
                placeholder="Special instructions, landmarks near delivery location…"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary resize-none"
              />
            </div>
          </form>
        </div>

        {/* ── Right: Order Summary + Submit ── */}
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
                    <p className="text-xs text-gray-400 mt-0.5">Qty: {item.quantity}</p>
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
              <p className="text-xs text-gray-400 mt-1">Payment collected on delivery / in store</p>
            </div>
          </div>

          {/* Turnstile */}
          {SITE_KEY && (
            <div className="mt-5">
              <Turnstile
                siteKey={SITE_KEY}
                onSuccess={setTurnstileToken}
                onError={() => setTurnstileToken(null)}
                onExpire={() => setTurnstileToken(null)}
              />
            </div>
          )}

          {/* Error */}
          {submitError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
          )}

          <button
            form="checkout-form"
            type="submit"
            disabled={placeMutation.isPending || (!!SITE_KEY && !turnstileToken)}
            className="mt-5 w-full flex items-center justify-center gap-2 py-4 bg-knef-primary text-white rounded-xl font-bold text-base hover:bg-opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {placeMutation.isPending ? (
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
            <a href="/terms" className="underline hover:text-gray-600">
              terms
            </a>
            . No card details are collected online.
          </p>
        </div>
      </div>
    </div>
  );
}
