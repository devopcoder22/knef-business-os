'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Package, Loader2, CheckCircle, ShieldCheck } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { useMutation } from '@tanstack/react-query';
import {
  createOrder,
  requestEmailOtp,
  verifyEmailOtp,
  requestSmsOtp,
  verifySmsOtp,
  postOrderRegister,
} from '@/lib/api';
import type { AuthResult } from '@/lib/api';

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
  customerEmail: z.string().email('Valid email required'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER']),
  notes: z.string().max(500, 'Notes too long').optional(),
});

type FormData = z.infer<typeof schema>;

type Step = 'form' | 'verify' | 'success';

export default function CheckoutPage() {
  const items = useCartStore((s) => s.items);
  const totalAmount = useCartStore((s) => s.totalAmount());
  const clearCart = useCartStore((s) => s.clearCart);

  // Step control
  const [step, setStep] = useState<Step>('form');
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [formSnapshot, setFormSnapshot] = useState<FormData | null>(null);

  // Turnstile (shown in verify step)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // OTP states
  const [phoneOtp, setPhoneOtp] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Post-order account creation
  const [showRegister, setShowRegister] = useState(true);
  const [regPassword, setRegPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'CASH' },
  });

  const placeMutation = useMutation({
    mutationFn: (data: FormData) =>
      createOrder({
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
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
      setStep('success');
    },
    onError: (err: unknown) => {
      const e = err as { message?: string };
      setOtpError(e?.message ?? 'Failed to place order. Please try again.');
    },
  });

  // ── Step 1: send OTPs then advance to verify screen ────────────────────────
  async function sendOtps(data: FormData) {
    setOtpSending(true);
    setOtpError('');
    setPhoneSent(false);
    setEmailSent(false);
    try {
      await Promise.all([
        requestEmailOtp(data.customerEmail)
          .then(() => setEmailSent(true))
          .catch(() => {}),
        requestSmsOtp(data.customerPhone)
          .then(() => setPhoneSent(true))
          .catch(() => {}),
      ]);
      setFormSnapshot(data);
      setStep('verify');
    } catch {
      setOtpError('Failed to send verification codes. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }

  // ── Step 2: verify OTPs then place order ───────────────────────────────────
  async function handleVerifyAndOrder() {
    if (!formSnapshot) return;
    setOtpVerifying(true);
    setOtpError('');
    try {
      if (emailSent && emailOtp.length < 4) {
        setOtpError('Enter your email verification code');
        return;
      }
      if (phoneSent && phoneOtp.length < 4) {
        setOtpError('Enter your phone verification code');
        return;
      }

      if (emailSent) await verifyEmailOtp(formSnapshot.customerEmail, emailOtp);
      if (phoneSent) await verifySmsOtp(formSnapshot.customerPhone, phoneOtp);

      await placeMutation.mutateAsync(formSnapshot);
    } catch (err) {
      const e = err as { message?: string };
      setOtpError(e?.message ?? 'Verification failed. Check your codes and try again.');
    } finally {
      setOtpVerifying(false);
    }
  }

  // ── Step 3: post-order account registration ────────────────────────────────
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
      const e = err as { message?: string };
      setRegError(e?.message ?? 'Failed to create account. Try registering separately.');
    } finally {
      setRegLoading(false);
    }
  }

  // ── Resend helpers ─────────────────────────────────────────────────────────
  async function resendEmailOtp() {
    if (!formSnapshot) return;
    try {
      await requestEmailOtp(formSnapshot.customerEmail);
      setEmailSent(true);
      setEmailOtp('');
      toast('success', 'Email code resent');
    } catch {
      toast('error', 'Could not resend email code');
    }
  }

  async function resendSmsOtp() {
    if (!formSnapshot) return;
    try {
      await requestSmsOtp(formSnapshot.customerPhone);
      setPhoneSent(true);
      setPhoneOtp('');
      toast('success', 'SMS code resent');
    } catch {
      toast('error', 'Could not resend SMS code');
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

  // ── Step 3: Success ────────────────────────────────────────────────────────
  if (step === 'success' && orderRef && formSnapshot) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* Success header */}
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

        {/* Two-card row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {/* Card 1: Track order */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-knef-primary/10 flex items-center justify-center">
              <Package size={20} className="text-knef-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Track Your Order</h3>
              <p className="text-sm text-gray-500">
                Check your order status and updates in real time.
              </p>
            </div>
            <Link
              href={`/order?ref=${orderRef}&email=${encodeURIComponent(formSnapshot.customerEmail)}`}
              className="mt-auto inline-flex items-center gap-1.5 px-4 py-2.5 bg-knef-primary text-white rounded-xl text-sm font-semibold hover:bg-opacity-90 transition-colors"
            >
              Track Order Status →
            </Link>
          </div>

          {/* Card 2: Create account */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <ShieldCheck size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Save Your Order History</h3>
              <p className="text-sm text-gray-500">
                Create a free account to track all your orders in one place.
              </p>
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
                  Account email:{' '}
                  <strong className="text-gray-700">{formSnapshot.customerEmail}</strong>
                </p>
                <input
                  type="password"
                  placeholder="Create a password (min 8 chars)"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                />
                {regError && (
                  <p className="text-xs text-red-600">{regError}</p>
                )}
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

        {/* Continue shopping */}
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

  // ── Step 2: OTP Verification ───────────────────────────────────────────────
  if (step === 'verify' && formSnapshot) {
    const neitherSent = !emailSent && !phoneSent;

    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={28} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify Your Details</h1>
          <p className="text-sm text-gray-500">
            We've sent verification codes to confirm your contact details.
          </p>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-6">
          {neitherSent ? (
            /* Verification unavailable — place order directly */
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
              Verification unavailable. We'll place your order directly.
            </div>
          ) : (
            <>
              {/* Phone OTP */}
              {phoneSent && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Code
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Sent to {formSnapshot.customerPhone}
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]*"
                    placeholder="6-digit code"
                    value={phoneOtp}
                    onChange={(e) =>
                      setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={resendSmsOtp}
                    className="mt-1.5 text-xs text-blue-600 hover:underline"
                  >
                    Resend SMS code
                  </button>
                </div>
              )}

              {/* Email OTP */}
              {emailSent && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Code
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Sent to {formSnapshot.customerEmail}
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]*"
                    placeholder="6-digit code"
                    value={emailOtp}
                    onChange={(e) =>
                      setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={resendEmailOtp}
                    className="mt-1.5 text-xs text-blue-600 hover:underline"
                  >
                    Resend email code
                  </button>
                </div>
              )}
            </>
          )}

          {/* Turnstile */}
          {SITE_KEY && (
            <div>
              <Turnstile
                siteKey={SITE_KEY}
                onSuccess={setTurnstileToken}
                onError={() => setTurnstileToken(null)}
                onExpire={() => setTurnstileToken(null)}
              />
            </div>
          )}

          {/* Error */}
          {otpError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {otpError}
            </p>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={handleVerifyAndOrder}
            disabled={
              otpVerifying ||
              placeMutation.isPending ||
              (!!SITE_KEY && !turnstileToken)
            }
            className="w-full flex items-center justify-center gap-2 py-4 bg-knef-primary text-white rounded-xl font-bold text-base hover:bg-opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {otpVerifying || placeMutation.isPending ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                {placeMutation.isPending ? 'Placing Order…' : 'Verifying…'}
              </>
            ) : neitherSent ? (
              'Place Order'
            ) : (
              'Verify & Place Order'
            )}
          </button>
        </div>

        {/* Back link */}
        <button
          type="button"
          onClick={() => {
            setStep('form');
            setOtpError('');
          }}
          className="mt-5 flex items-center gap-1.5 text-sm text-gray-500 hover:text-knef-primary transition-colors mx-auto"
        >
          <ArrowLeft size={14} />
          Change details
        </button>
      </div>
    );
  }

  // ── Step 1: Checkout Form ──────────────────────────────────────────────────
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
            onSubmit={handleSubmit(sendOtps)}
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
                  errors.customerName ? 'border-red-300' : 'border-gray-200',
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
                  errors.customerPhone ? 'border-red-300' : 'border-gray-200',
                )}
              />
              {errors.customerPhone && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.customerPhone.message}
                </p>
              )}
            </div>

            {/* Email (now required) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                {...register('customerEmail')}
                type="email"
                placeholder="you@example.com"
                className={cn(
                  'w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                  errors.customerEmail ? 'border-red-300' : 'border-gray-200',
                )}
              />
              <p className="mt-1 text-xs text-gray-400">
                Required for order confirmation and tracking
              </p>
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
                  {
                    value: 'CASH',
                    label: 'Cash on Delivery',
                    sub: 'Pay when you receive your order',
                  },
                  {
                    value: 'BANK_TRANSFER',
                    label: 'Bank Transfer',
                    sub: 'Transfer before dispatch',
                  },
                ] as const).map(({ value, label, sub }) => (
                  <label
                    key={value}
                    className="relative flex cursor-pointer rounded-xl border border-gray-200 p-3 hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition-colors"
                  >
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
              <p className="text-xs text-gray-400 mt-1">
                Payment collected on delivery / in store
              </p>
            </div>
          </div>

          {/* OTP sending error shown here if it happens before advancing */}
          {otpError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {otpError}
            </p>
          )}

          <button
            form="checkout-form"
            type="submit"
            disabled={otpSending}
            className="mt-5 w-full flex items-center justify-center gap-2 py-4 bg-knef-primary text-white rounded-xl font-bold text-base hover:bg-opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {otpSending ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Sending Codes…
              </>
            ) : (
              'Continue to Verification'
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
