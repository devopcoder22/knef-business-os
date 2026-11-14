'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import {
  ArrowLeft,
  Package,
  Loader2,
  CheckCircle,
  ShieldCheck,
  MapPin,
  Truck,
  Store,
  Tag,
  Gift,
  X,
  ChevronDown,
  CreditCard,
  Banknote,
  Eye,
  EyeOff,
  Lock,
  AlertTriangle,
  Check,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { useMutation } from '@tanstack/react-query';
import {
  createOrder,
  requestEmailOtp,
  verifyEmailOtp,
  requestSmsOtp,
  verifySmsOtp,
  verifyPaystackPayment,
  fetchPaymentConfig,
} from '@/lib/api';
import type { OrderConfirmation } from '@/types';
import { useCartStore } from '@/stores/cart.store';
import { useCustomerStore } from '@/stores/customer.store';
import { formatNGN, cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type PendingPayment = NonNullable<OrderConfirmation['payment']> & { amountDue: number };

const schema = z.object({
  customerName: z.string().min(2, 'Full name is required').max(100, 'Name is too long'),
  customerPhone: z
    .string()
    .min(7, 'Valid phone number required')
    .max(20, 'Phone number too long')
    .regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number'),
  customerEmail: z.string().email('Valid email required'),
  deliveryAddress: z.string().optional(),
  deliveryCountry: z.string().optional(),
  deliveryCity: z.string().optional(),
  deliveryState: z.string().optional(),
  deliveryPhone: z.string().optional(),
  deliveryLandmark: z.string().max(200, 'Landmark too long').optional(),
  paymentMethod: z.enum(['CASH', 'PAYSTACK']),
  notes: z.string().max(500, 'Notes too long').optional(),
});

type FormData = z.infer<typeof schema>;
type OtpStep = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';
type PaymentChoice = FormData['paymentMethod'];
type PaymentOption = {
  value: PaymentChoice;
  title: string;
  sub: string;
  icon: LucideIcon;
  badge?: { text: string; tone: 'green' | 'amber' };
  disabled?: boolean;
};

/** Payment on delivery is offered only for Lagos (Nigeria) addresses. Mirrors the API rule. */
function isLagos(country?: string, state?: string) {
  if (country && country !== 'Nigeria') return false;
  const s = (state ?? '').trim().toLowerCase();
  return s === 'lagos' || s === 'lagos state';
}

/** 0–4 score for the password strength meter. */
function passwordScore(pw: string) {
  if (!pw) return 0;
  let score = pw.length >= 8 ? 1 : 0;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}
const STRENGTH = [
  { label: 'Too short', bar: 'bg-gray-200', text: 'text-gray-400' },
  { label: 'Weak', bar: 'bg-red-400', text: 'text-red-500' },
  { label: 'Fair', bar: 'bg-amber-400', text: 'text-amber-600' },
  { label: 'Good', bar: 'bg-lime-500', text: 'text-lime-600' },
  { label: 'Strong', bar: 'bg-green-500', text: 'text-green-600' },
];

declare global {
  interface Window {
    // Paystack InlineJS v2 — resumes a transaction the server already initialized.
    PaystackPop?: new () => {
      resumeTransaction(
        accessCode: string,
        callbacks?: {
          onSuccess?: (transaction: { reference?: string }) => void;
          onCancel?: () => void;
          onError?: (error: { message?: string }) => void;
        },
      ): void;
    };
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: { componentRestrictions?: { country?: string }; fields?: string[] },
          ) => {
            addListener: (event: string, handler: () => void) => void;
            getPlace: () => {
              formatted_address?: string;
              place_id?: string;
              address_components?: Array<{ long_name: string; types: string[] }>;
              geometry?: {
                location: {
                  lat: () => number;
                  lng: () => number;
                };
              };
            };
          };
          AutocompleteSessionToken: new () => object;
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

  // Phone OTP
  const [phoneOtpStep, setPhoneOtpStep] = useState<OtpStep>('idle');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpError, setPhoneOtpError] = useState('');

  // Shipping method
  const [shippingMethod, setShippingMethod] = useState<'STORE_PICKUP' | 'DELIVERY'>('STORE_PICKUP');
  const [showDeliveryPopup, setShowDeliveryPopup] = useState(false);

  // Coupon
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Gift card
  const [showGiftCardInput, setShowGiftCardInput] = useState(false);
  const [giftCardInput, setGiftCardInput] = useState('');
  const [appliedGiftCard, setAppliedGiftCard] = useState<{ code: string; balance: number; amountToUse: number } | null>(null);
  const [giftCardLoading, setGiftCardLoading] = useState(false);
  const [giftCardError, setGiftCardError] = useState('');

  // Logged-in customer, or a required account created with the order
  const customer = useCustomerStore((s) => s.customer);
  const accessToken = useCustomerStore((s) => s.accessToken);
  const isAuthenticated = useCustomerStore((s) => s.isAuthenticated);
  const setAuth = useCustomerStore((s) => s.setAuth);
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [savedToAccount, setSavedToAccount] = useState(false);

  // Terms and payment-on-delivery notice
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showLagosPopup, setShowLagosPopup] = useState(false);

  // Card payments (server-driven Paystack)
  const [paystackEnabled, setPaystackEnabled] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  useEffect(() => {
    let active = true;
    fetchPaymentConfig().then((c) => {
      if (active) setPaystackEnabled(c.paystackEnabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const placeIdRef = useRef<string | null>(null);
  const latitudeRef = useRef<number | null>(null);
  const longitudeRef = useRef<number | null>(null);
  const addressSourceRef = useRef<'GOOGLE_PLACE' | 'MANUAL'>('MANUAL');
  const [mapsError, setMapsError] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'CASH', deliveryCountry: 'Nigeria' },
  });

  const watchEmail = useWatch({ control, name: 'customerEmail' });
  const watchPhone = useWatch({ control, name: 'customerPhone' });
  const watchCountry = useWatch({ control, name: 'deliveryCountry' });
  const watchPaymentMethod = useWatch({ control, name: 'paymentMethod' });
  const watchState = useWatch({ control, name: 'deliveryState' });

  const addressInLagos = isLagos(watchCountry, watchState);
  const stateChosen = !!watchState?.trim();
  const podBlocked =
    shippingMethod === 'DELIVERY' && watchPaymentMethod === 'CASH' && stateChosen && !addressInLagos;

  // Each shipping method has its own pair of options; preselect the sensible default when it changes.
  useEffect(() => {
    setValue('paymentMethod', shippingMethod === 'DELIVERY' && paystackEnabled ? 'PAYSTACK' : 'CASH');
  }, [shippingMethod, paystackEnabled, setValue]);

  function selectPayment(value: PaymentChoice) {
    setValue('paymentMethod', value, { shouldValidate: true });
    setSubmitError('');
    if (shippingMethod === 'DELIVERY' && value === 'CASH') setShowLagosPopup(true);
  }

  function dismissLagosPopup(confirmLagos: boolean) {
    setShowLagosPopup(false);
    if (confirmLagos) {
      setValue('deliveryCountry', 'Nigeria');
      setValue('deliveryState', 'Lagos');
      return;
    }
    // Not in Lagos (or closed the notice without confirming): fall back to paying online.
    if (!addressInLagos && paystackEnabled) setValue('paymentMethod', 'PAYSTACK');
  }

  const pwScore = passwordScore(accountPassword);
  const passwordsMatch = accountPasswordConfirm.length > 0 && accountPassword === accountPasswordConfirm;

  // Prefill contact details for a logged-in customer (only into empty fields)
  useEffect(() => {
    if (!isAuthenticated || !customer) return;
    if (!getValues('customerEmail')) setValue('customerEmail', customer.email);
    if (!getValues('customerName')) {
      const name = `${customer.firstName} ${customer.lastName === '-' ? '' : customer.lastName}`.trim();
      if (name) setValue('customerName', name);
    }
  }, [isAuthenticated, customer, getValues, setValue]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchEmail ?? '');
  const phoneValid = /^\+?[\d\s\-()]{7,}$/.test(watchPhone ?? '');

  // Google Maps Places autocomplete
  const initAutocomplete = useCallback(() => {
    if (!addressInputRef.current || !window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      componentRestrictions: { country: watchCountry === 'Nigeria' ? 'ng' : undefined },
      fields: ['formatted_address', 'address_components', 'place_id', 'geometry'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (place.formatted_address) {
        setValue('deliveryAddress', place.formatted_address, { shouldValidate: true });
      }
      placeIdRef.current = place.place_id ?? null;
      latitudeRef.current = place.geometry?.location.lat() ?? null;
      longitudeRef.current = place.geometry?.location.lng() ?? null;
      addressSourceRef.current = 'GOOGLE_PLACE';
      const comps = place.address_components ?? [];
      const city =
        comps.find((c) => c.types.includes('locality'))?.long_name ??
        comps.find((c) => c.types.includes('administrative_area_level_2'))?.long_name ??
        '';
      const state = comps.find((c) => c.types.includes('administrative_area_level_1'))?.long_name ?? '';
      if (city) setValue('deliveryCity', city);
      if (state) setValue('deliveryState', state);
    });
  }, [setValue, watchCountry]);

  const handleAddressInputChange = useCallback(() => {
    // When user types manually, clear Google-sourced data
    addressSourceRef.current = 'MANUAL';
    placeIdRef.current = null;
    latitudeRef.current = null;
    longitudeRef.current = null;
  }, []);

  // Phone OTP
  async function sendPhoneOtp() {
    setPhoneOtpStep('sending');
    setPhoneOtpError('');
    try {
      await requestSmsOtp(getValues('customerPhone'));
      setPhoneOtpStep('sent');
      toast('success', 'SMS verification code sent');
    } catch (err) {
      setPhoneOtpError((err as { message?: string }).message ?? 'Failed to send SMS code');
      setPhoneOtpStep('idle');
    }
  }

  async function verifyPhone() {
    setPhoneOtpStep('verifying');
    setPhoneOtpError('');
    try {
      await verifySmsOtp(getValues('customerPhone'), phoneOtp);
      setPhoneOtpStep('verified');
      toast('success', 'Phone number verified');
    } catch (err) {
      setPhoneOtpError((err as { message?: string }).message ?? 'Invalid code. Try again.');
      setPhoneOtpStep('sent');
    }
  }

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

  // Computed totals
  const couponDiscount = appliedCoupon?.discount ?? 0;
  const afterCoupon = Math.max(0, totalAmount - couponDiscount);
  const giftCardAmountToUse = appliedGiftCard ? Math.min(appliedGiftCard.balance, afterCoupon) : 0;
  const finalTotal = Math.max(0, afterCoupon - giftCardAmountToUse);

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await fetch('/api/coupon-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput.trim().toUpperCase(), orderAmount: totalAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid coupon code');
      setAppliedCoupon({ code: couponInput.trim().toUpperCase(), discount: data.discountAmount });
      setShowCouponInput(false);
      toast('success', `Coupon applied — ${formatNGN(data.discountAmount)} off`);
    } catch (err) {
      setCouponError((err as Error).message);
    } finally {
      setCouponLoading(false);
    }
  }

  async function applyGiftCard() {
    if (!giftCardInput.trim()) return;
    setGiftCardLoading(true);
    setGiftCardError('');
    try {
      const res = await fetch('/api/gift-card-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: giftCardInput.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid gift card code');
      const toUse = Math.min(data.remainingAmount, afterCoupon);
      setAppliedGiftCard({ code: giftCardInput.trim().toUpperCase(), balance: data.remainingAmount, amountToUse: toUse });
      setShowGiftCardInput(false);
      toast('success', `Gift card applied — ${formatNGN(toUse)} redeemed`);
    } catch (err) {
      setGiftCardError((err as Error).message);
    } finally {
      setGiftCardLoading(false);
    }
  }

  const placeMutation = useMutation({
    mutationFn: (payload: FormData) =>
      createOrder({
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerEmail: payload.customerEmail,
        deliveryAddress: shippingMethod === 'DELIVERY' ? payload.deliveryAddress : undefined,
        deliveryCity: shippingMethod === 'DELIVERY' ? payload.deliveryCity : undefined,
        deliveryState: shippingMethod === 'DELIVERY' && payload.deliveryState
          ? `${payload.deliveryState}${payload.deliveryCountry && payload.deliveryCountry !== 'Nigeria' ? `, ${payload.deliveryCountry}` : ''}`
          : shippingMethod === 'DELIVERY' ? payload.deliveryCountry : undefined,
        deliveryPhone: shippingMethod === 'DELIVERY' ? payload.deliveryPhone : undefined,
        deliveryLandmark: shippingMethod === 'DELIVERY' ? payload.deliveryLandmark || undefined : undefined,
        deliveryCountry: shippingMethod === 'DELIVERY' ? payload.deliveryCountry || undefined : undefined,
        deliveryPlaceId: shippingMethod === 'DELIVERY' ? placeIdRef.current || undefined : undefined,
        deliveryLatitude: shippingMethod === 'DELIVERY' ? latitudeRef.current ?? undefined : undefined,
        deliveryLongitude: shippingMethod === 'DELIVERY' ? longitudeRef.current ?? undefined : undefined,
        deliveryAddressSource: shippingMethod === 'DELIVERY' ? addressSourceRef.current : undefined,
        deliveryMethod: shippingMethod === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
        paymentMethod: payload.paymentMethod,
        notes: payload.notes || undefined,
        idempotencyKey: crypto.randomUUID(),
        turnstileToken: turnstileToken ?? undefined,
        ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
        ...(appliedGiftCard ? { giftCardCode: appliedGiftCard.code } : {}),
        termsAccepted,
        ...(!isAuthenticated ? { createAccount: true, accountPassword, accountPasswordConfirm } : {}),
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId ?? undefined,
          quantity: i.quantity,
        })),
      }, isAuthenticated ? accessToken : null),
    onSuccess: (res) => {
      const order = res.data;
      setOrderRef(order.reference);
      setSavedToAccount(!!order.linkedToAccount);
      if (order.account) {
        setAuth(order.account.customer, order.account.accessToken, order.account.refreshToken);
        setAccountCreated(true);
        toast('success', 'Your account has been created');
      }
      if (order.accountError) toast('error', order.accountError);

      if (order.payment) {
        // Order is saved; it completes once the card payment is verified.
        const payment: PendingPayment = { ...order.payment, amountDue: Number(order.amountDue ?? order.totalAmount) };
        setPendingPayment(payment);
        openPaystack(payment);
        return;
      }
      clearCart();
      setStep('success');
    },
    onError: (err: unknown) => {
      setSubmitError((err as { message?: string })?.message ?? 'Failed to place order. Please try again.');
    },
  });

  async function onSubmit(data: FormData) {
    setSubmitError('');
    if (phoneOtpStep !== 'verified') {
      setSubmitError('Please verify your phone number before placing the order');
      return;
    }
    if (emailOtpStep === 'sent' || emailOtpStep === 'verifying') {
      setSubmitError('Please verify your email address before placing the order');
      return;
    }
    if (shippingMethod === 'DELIVERY' && (!data.deliveryAddress || data.deliveryAddress.length < 5)) {
      setSubmitError('Please enter a delivery address');
      return;
    }
    if (shippingMethod === 'DELIVERY' && !data.deliveryState?.trim()) {
      setSubmitError('Please select the state for your delivery address');
      return;
    }
    if (data.paymentMethod === 'PAYSTACK' && !paystackEnabled) {
      setSubmitError('Online payment is temporarily unavailable. Please choose another payment option.');
      return;
    }
    if (shippingMethod === 'DELIVERY' && data.paymentMethod === 'CASH' && !isLagos(data.deliveryCountry, data.deliveryState)) {
      setSubmitError('Payment on delivery is only available in Lagos. Please pay online with Paystack.');
      setShowLagosPopup(true);
      return;
    }
    if (!isAuthenticated) {
      if (accountPassword.length < 8) {
        setSubmitError('Create a password of at least 8 characters for your account');
        return;
      }
      if (accountPassword !== accountPasswordConfirm) {
        setSubmitError('Your passwords do not match');
        return;
      }
    }
    if (!termsAccepted) {
      setSubmitError('Please accept the Terms and Conditions to place your order');
      return;
    }
    setFormSnapshot(data);

    // For card payments the server creates the order, starts the Paystack transaction and
    // returns an access code; onSuccess then opens the Paystack popup.
    await placeMutation.mutateAsync(data);
  }

  function openPaystack(payment: PendingPayment) {
    setSubmitError('');
    if (!window.PaystackPop) {
      // Popup script not available — use Paystack's hosted page; it returns to /checkout/payment-return.
      window.location.href = payment.authorizationUrl;
      return;
    }
    try {
      const popup = new window.PaystackPop();
      popup.resumeTransaction(payment.accessCode, {
        onSuccess: () => {
          void confirmPayment(payment.reference);
        },
        onCancel: () => {
          setSubmitError('Payment was not completed. Your order is saved — click "Pay now" to try again.');
        },
        onError: (error) => {
          setSubmitError(error?.message ?? 'The card payment window could not be opened. Please try again.');
        },
      });
    } catch {
      window.location.href = payment.authorizationUrl;
    }
  }

  async function confirmPayment(reference: string) {
    setVerifyingPayment(true);
    setSubmitError('');
    try {
      // Paystack can take a few seconds to report success; poll briefly.
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await verifyPaystackPayment(reference);
        if (res.data.status === 'paid') {
          clearCart();
          setPendingPayment(null);
          setStep('success');
          return;
        }
        if (res.data.status === 'failed') {
          setSubmitError('Your card payment did not go through. Click "Pay now" to try again.');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      setSubmitError(
        'We have not received confirmation from Paystack yet. If you completed payment, wait a moment and click "I\'ve paid". Your order is saved.',
      );
    } catch (err) {
      setSubmitError((err as { message?: string })?.message ?? 'Could not check your payment. Please try again.');
    } finally {
      setVerifyingPayment(false);
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

          {/* Account */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <UserRound size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">
                {accountCreated ? 'Your Account Is Ready' : 'Saved to Your Account'}
              </h3>
              <p className="text-sm text-gray-500">
                {accountCreated
                  ? `You're signed in as ${formSnapshot.customerEmail}. Log in with this email next time.`
                  : savedToAccount
                    ? 'This order is in your order history alongside your previous orders.'
                    : 'Log in to see this order in your order history.'}
              </p>
            </div>
            <Link
              href={accountCreated || savedToAccount ? '/account/orders' : '/login?redirect=/account/orders'}
              className="mt-auto inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              View My Orders →
            </Link>
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
      {/* Delivery note popup */}
      {showDeliveryPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative">
            <button
              type="button"
              onClick={() => { setShippingMethod('STORE_PICKUP'); setShowDeliveryPopup(false); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
              <Truck size={22} className="text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delivery Note</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              Delivery takes <strong>1–3 working days in Lagos</strong> and <strong>2–7 working days outside Lagos</strong>, after order and payment confirmation.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowDeliveryPopup(false)}
                className="w-full py-2.5 bg-knef-primary text-white rounded-xl font-semibold text-sm hover:bg-opacity-90 transition-colors"
              >
                Continue with Delivery
              </button>
              <button
                type="button"
                onClick={() => { setShippingMethod('STORE_PICKUP'); setShowDeliveryPopup(false); }}
                className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
              >
                Switch to Store Pickup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Payment on delivery — Lagos only */}
      {showLagosPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lagos-popup-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative">
            <button
              type="button"
              aria-label="Close"
              onClick={() => dismissLagosPopup(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
            {stateChosen && !addressInLagos ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
                  <AlertTriangle size={22} className="text-red-500" />
                </div>
                <h3 id="lagos-popup-title" className="text-lg font-bold text-gray-900 mb-2">
                  Not available for your address
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-5">
                  Payment on Delivery is only available to customers in <strong>Lagos</strong>. Your delivery address is in{' '}
                  <strong>{watchState}</strong>
                  {watchCountry && watchCountry !== 'Nigeria' ? `, ${watchCountry}` : ''}. Please pay online with Paystack —
                  card or bank transfer.
                </p>
                <div className="flex flex-col gap-2">
                  {paystackEnabled && (
                    <button
                      type="button"
                      onClick={() => dismissLagosPopup(false)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-knef-primary text-white rounded-xl font-semibold text-sm hover:bg-opacity-90 transition-colors"
                    >
                      <CreditCard size={16} /> Pay Online Instead
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowLagosPopup(false);
                      setShippingMethod('STORE_PICKUP');
                    }}
                    className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
                  >
                    Switch to Store Pickup
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
                  <MapPin size={22} className="text-amber-600" />
                </div>
                <h3 id="lagos-popup-title" className="text-lg font-bold text-gray-900 mb-2">
                  Lagos deliveries only
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-5">
                  Payment on Delivery is only available to customers with a delivery address in <strong>Lagos</strong>.
                  If you&apos;re outside Lagos, please pay online with Paystack — card or bank transfer.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => dismissLagosPopup(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-knef-primary text-white rounded-xl font-semibold text-sm hover:bg-opacity-90 transition-colors"
                  >
                    <Check size={16} /> My address is in Lagos
                  </button>
                  {paystackEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowLagosPopup(false);
                        setValue('paymentMethod', 'PAYSTACK');
                      }}
                      className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
                    >
                      I&apos;m outside Lagos — Pay Online
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {paystackEnabled && (
        <Script src="https://js.paystack.co/v2/inline.js" strategy="lazyOnload" />
      )}
      {MAPS_KEY && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places`}
          onLoad={initAutocomplete}
          onError={() => setMapsError(true)}
          strategy="lazyOnload"
        />
      )}

      {mapsError && (
        <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          Address suggestions are temporarily unavailable. Please enter your address manually.
        </div>
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
          {/* Returning customer */}
          <div className="text-sm text-gray-500">
            Returning customer?{' '}
            <Link href="/login?redirect=/checkout" className="text-knef-primary font-medium hover:underline">
              Click here to login
            </Link>
          </div>

          <form id="checkout-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* ── Shipping Method ── */}
            <div>
              <h2 className="font-semibold text-gray-900 mb-3">Shipping Method</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShippingMethod('STORE_PICKUP')}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-xl border-2 font-medium text-sm transition-all',
                    shippingMethod === 'STORE_PICKUP'
                      ? 'border-knef-primary bg-knef-primary/5 text-knef-primary'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300',
                  )}
                >
                  <Store size={22} />
                  <span>Store Pickup</span>
                  <span className="text-xs font-normal text-green-600">Free</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShippingMethod('DELIVERY'); setShowDeliveryPopup(true); }}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-xl border-2 font-medium text-sm transition-all',
                    shippingMethod === 'DELIVERY'
                      ? 'border-knef-primary bg-knef-primary/5 text-knef-primary'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300',
                  )}
                >
                  <Truck size={22} />
                  <span>Delivery</span>
                  <span className="text-xs font-normal text-gray-400">Address required</span>
                </button>
              </div>
            </div>

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

              {/* Phone + inline SMS OTP */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    {...register('customerPhone')}
                    type="tel"
                    placeholder="+234 800 000 0000"
                    disabled={phoneOtpStep === 'verified'}
                    className={cn(
                      'flex-1 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                      errors.customerPhone ? 'border-red-300' : 'border-gray-200',
                      phoneOtpStep === 'verified' && 'bg-green-50 border-green-300',
                    )}
                  />
                  {phoneOtpStep === 'verified' ? (
                    <div className="flex items-center gap-1.5 px-3 text-green-600 text-sm font-medium shrink-0">
                      <CheckCircle size={16} />
                      Verified
                    </div>
                  ) : phoneValid && phoneOtpStep === 'idle' ? (
                    <button
                      type="button"
                      onClick={sendPhoneOtp}
                      className="shrink-0 px-4 py-3 bg-gray-800 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
                    >
                      Send Code
                    </button>
                  ) : phoneOtpStep === 'sending' ? (
                    <div className="shrink-0 flex items-center px-4 text-gray-400 text-sm">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  A verification code will be sent via SMS
                </p>
                {errors.customerPhone && (
                  <p className="mt-1 text-xs text-red-600">{errors.customerPhone.message}</p>
                )}

                {/* SMS code input */}
                {(phoneOtpStep === 'sent' || phoneOtpStep === 'verifying') && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit SMS code"
                      value={phoneOtp}
                      onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-knef-primary"
                    />
                    <button
                      type="button"
                      onClick={verifyPhone}
                      disabled={phoneOtp.length < 6 || phoneOtpStep === 'verifying'}
                      className="shrink-0 px-4 py-2.5 bg-knef-primary text-white text-sm font-medium rounded-xl hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {phoneOtpStep === 'verifying' ? <Loader2 size={16} className="animate-spin" /> : 'Verify'}
                    </button>
                  </div>
                )}
                {phoneOtpError && <p className="mt-1 text-xs text-red-600">{phoneOtpError}</p>}
                {phoneOtpStep === 'sent' && (
                  <button
                    type="button"
                    onClick={sendPhoneOtp}
                    className="mt-1 text-xs text-blue-600 hover:underline"
                  >
                    Resend code
                  </button>
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

            {/* ── Delivery Address (only shown when DELIVERY selected) ── */}
            {shippingMethod === 'DELIVERY' && <div>
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
                  onChange={(e) => {
                    void addressField.onChange(e);
                    handleAddressInputChange();
                  }}
                  aria-label="Street address"
                  aria-describedby={MAPS_KEY ? 'address-hint' : undefined}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded="false"
                />
                {MAPS_KEY && (
                  <p id="address-hint" className="mt-1 text-xs text-gray-400">Start typing — select from suggestions</p>
                )}
                {errors.deliveryAddress && (
                  <p className="mt-1 text-xs text-red-600">{errors.deliveryAddress.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <select
                    {...register('deliveryCountry')}
                    defaultValue="Nigeria"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors bg-white"
                  >
                    <option value="">Select country…</option>
                    <optgroup label="West Africa">
                      {['Nigeria','Ghana','Senegal','Côte d\'Ivoire','Mali','Burkina Faso',
                        'Niger','Guinea','Benin','Sierra Leone','Togo','Liberia',
                        'Guinea-Bissau','Gambia','Mauritania','Cape Verde'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    <optgroup label="All Countries">
                      {['Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda',
                        'Argentina','Armenia','Australia','Austria','Azerbaijan','Bahamas','Bahrain',
                        'Bangladesh','Barbados','Belarus','Belgium','Belize','Bolivia','Bosnia and Herzegovina',
                        'Botswana','Brazil','Brunei','Bulgaria','Burundi','Cambodia','Cameroon','Canada',
                        'Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo',
                        'Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti',
                        'Dominica','Dominican Republic','DR Congo','Ecuador','Egypt','El Salvador',
                        'Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji','Finland',
                        'France','Gabon','Georgia','Germany','Greece','Grenada','Guatemala','Guyana',
                        'Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq',
                        'Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya',
                        'Kiribati','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Libya',
                        'Liechtenstein','Lithuania','Luxembourg','Madagascar','Malawi','Malaysia',
                        'Maldives','Malta','Marshall Islands','Mexico','Micronesia','Moldova','Monaco',
                        'Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nauru',
                        'Nepal','Netherlands','New Zealand','Nicaragua','North Korea','North Macedonia',
                        'Norway','Oman','Pakistan','Palau','Palestine','Panama','Papua New Guinea',
                        'Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia',
                        'Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines',
                        'Samoa','San Marino','Saudi Arabia','Serbia','Seychelles','Slovakia','Slovenia',
                        'Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain',
                        'Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Taiwan',
                        'Tajikistan','Tanzania','Thailand','Timor-Leste','Trinidad and Tobago',
                        'Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine',
                        'United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan',
                        'Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
                      ].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State / Region</label>
                  {watchCountry === 'Nigeria' ? (
                    <select
                      {...register('deliveryState')}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors bg-white"
                    >
                      <option value="">Select state…</option>
                      {['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
                        'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT (Abuja)','Gombe',
                        'Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos',
                        'Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
                        'Taraba','Yobe','Zamfara'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      {...register('deliveryState')}
                      type="text"
                      placeholder="State / Region / Province"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors"
                    />
                  )}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">City / LGA</label>
                <input
                  {...register('deliveryCity')}
                  type="text"
                  placeholder="e.g. Ikeja"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Landmark{' '}
                  <span className="text-gray-400 font-normal">(optional — helps the delivery driver find you)</span>
                </label>
                <input
                  {...register('deliveryLandmark')}
                  type="text"
                  placeholder="e.g. Beside First Bank, opposite Chicken Republic"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors"
                />
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
            </div>}

            {/* ── Payment Method ── */}
            <div>
              <h2 className="font-semibold text-gray-900 mb-3">
                Payment Method <span className="text-red-500">*</span>
              </h2>
              <input type="hidden" {...register('paymentMethod')} />
              <div role="radiogroup" aria-label="Payment method" className="space-y-3">
                {(() => {
                  const online: PaymentOption = {
                    value: 'PAYSTACK',
                    title: 'Pay Online with Paystack',
                    sub: paystackEnabled ? 'Card or Bank Transfer — fast and secure' : 'Temporarily unavailable',
                    icon: CreditCard,
                    badge: paystackEnabled ? { text: 'Secure', tone: 'green' } : undefined,
                    disabled: !paystackEnabled,
                  };
                  const options: PaymentOption[] =
                    shippingMethod === 'STORE_PICKUP'
                      ? [
                          {
                            value: 'CASH',
                            title: 'Pay in Store',
                            sub: 'Pay with cash, card or transfer when you pick up',
                            icon: Store,
                          },
                          online,
                        ]
                      : [
                          online,
                          {
                            value: 'CASH',
                            title: 'Payment on Delivery',
                            sub: 'Pay when your order arrives',
                            icon: Banknote,
                            badge: { text: 'Lagos only', tone: 'amber' },
                          },
                        ];
                  return options.map((opt) => {
                    const selected = watchPaymentMethod === opt.value;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={opt.disabled}
                        onClick={() => selectPayment(opt.value)}
                        className={cn(
                          'w-full flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all',
                          selected
                            ? 'border-knef-primary bg-knef-primary/5 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300',
                          opt.disabled && 'opacity-50 cursor-not-allowed hover:border-gray-200',
                        )}
                      >
                        <span
                          className={cn(
                            'w-11 h-11 shrink-0 rounded-xl flex items-center justify-center transition-colors',
                            selected ? 'bg-knef-primary text-white' : 'bg-gray-100 text-gray-500',
                          )}
                        >
                          <Icon size={20} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{opt.title}</span>
                            {opt.badge && (
                              <span
                                className={cn(
                                  'text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full',
                                  opt.badge.tone === 'green' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
                                )}
                              >
                                {opt.badge.text}
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-gray-500 mt-0.5">{opt.sub}</span>
                        </span>
                        <span
                          className={cn(
                            'w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
                            selected ? 'border-knef-primary bg-knef-primary' : 'border-gray-300',
                          )}
                        >
                          {selected && <Check size={12} className="text-white" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>
              {podBlocked && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    Payment on Delivery is only available in Lagos. Your address is in <strong>{watchState}</strong> —
                    please pay online{paystackEnabled ? '' : ' or choose Store Pickup'}.
                  </span>
                </div>
              )}
            </div>

            {/* ── Account ── */}
            {isAuthenticated && customer ? (
              <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-green-100 flex items-center justify-center">
                  <ShieldCheck size={18} />
                </span>
                <span>
                  <span className="block font-semibold">Signed in as {customer.email}</span>
                  <span className="block text-green-700/80 mt-0.5">This order will be saved to your account.</span>
                </span>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50/80 to-white p-5">
                <div className="flex items-start gap-3 mb-4">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-knef-primary/10 flex items-center justify-center">
                    <UserRound size={20} className="text-knef-primary" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-gray-900">Create Your Account</h2>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      An account is required to check out. Track your orders and check out faster next time — we&apos;ll
                      use {emailValid ? <strong className="text-gray-700">{watchEmail}</strong> : 'the email above'}.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="account-password" className="block text-sm font-medium text-gray-700 mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        id="account-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        maxLength={128}
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="w-full border border-gray-200 bg-white rounded-xl pl-10 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {accountPassword && (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex flex-1 gap-1">
                          {[1, 2, 3, 4].map((i) => (
                            <span
                              key={i}
                              className={cn(
                                'h-1.5 flex-1 rounded-full transition-colors',
                                pwScore >= i ? STRENGTH[pwScore].bar : 'bg-gray-200',
                              )}
                            />
                          ))}
                        </div>
                        <span className={cn('text-xs font-medium w-16 text-right', STRENGTH[pwScore].text)}>
                          {STRENGTH[pwScore].label}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="account-password-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        id="account-password-confirm"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        maxLength={128}
                        value={accountPasswordConfirm}
                        onChange={(e) => setAccountPasswordConfirm(e.target.value)}
                        placeholder="Re-enter your password"
                        className={cn(
                          'w-full border bg-white rounded-xl pl-10 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary transition-colors',
                          accountPasswordConfirm && !passwordsMatch ? 'border-red-300' : 'border-gray-200',
                          passwordsMatch && 'border-green-300',
                        )}
                      />
                      {passwordsMatch && (
                        <CheckCircle size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-green-500" />
                      )}
                    </div>
                    {accountPasswordConfirm && !passwordsMatch && (
                      <p className="mt-1 text-xs text-red-600">Passwords don&apos;t match</p>
                    )}
                  </div>
                </div>

                <p className="mt-4 text-xs text-gray-500">
                  Already have an account?{' '}
                  <Link href="/login?redirect=/checkout" className="text-knef-primary font-medium hover:underline">
                    Log in
                  </Link>
                </p>
              </div>
            )}

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

            <div className="border-t border-gray-100 px-4 py-4 space-y-2">
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatNGN(totalAmount)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between items-center text-sm text-green-700">
                  <span className="flex items-center gap-1"><Tag size={12} /> Coupon ({appliedCoupon.code})</span>
                  <div className="flex items-center gap-1">
                    <span>−{formatNGN(couponDiscount)}</span>
                    <button type="button" onClick={() => setAppliedCoupon(null)} className="text-gray-400 hover:text-red-500 ml-1"><X size={12} /></button>
                  </div>
                </div>
              )}
              {appliedGiftCard && (
                <div className="flex justify-between items-center text-sm text-blue-700">
                  <span className="flex items-center gap-1"><Gift size={12} /> Gift Card ({appliedGiftCard.code})</span>
                  <div className="flex items-center gap-1">
                    <span>−{formatNGN(giftCardAmountToUse)}</span>
                    <button type="button" onClick={() => setAppliedGiftCard(null)} className="text-gray-400 hover:text-red-500 ml-1"><X size={12} /></button>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center font-bold text-lg pt-1 border-t border-gray-100">
                <span className="text-gray-900">Total</span>
                <span className="text-knef-primary">{formatNGN(finalTotal)}</span>
              </div>
              <p className="text-xs text-gray-400">
                {watchPaymentMethod === 'PAYSTACK'
                  ? 'Paid securely online via Paystack (card or bank transfer)'
                  : shippingMethod === 'DELIVERY'
                    ? 'Payment collected on delivery (Lagos only)'
                    : 'Pay when you pick up in store'}
              </p>
            </div>
          </div>

          {/* Coupon */}
          <div className={cn("mt-4 border border-gray-200 rounded-xl overflow-hidden bg-white", appliedCoupon && "hidden")}>
            {!appliedCoupon && (
              <>
                <button
                  type="button"
                  onClick={() => setShowCouponInput(!showCouponInput)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2"><Tag size={14} className="text-knef-primary" /> Have a coupon? Click here to enter your code</span>
                  <ChevronDown size={14} className={cn('transition-transform', showCouponInput && 'rotate-180')} />
                </button>
                {showCouponInput && (
                  <div className="px-4 pb-4 space-y-2 border-t border-gray-100">
                    <div className="flex gap-2 mt-3">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                        placeholder="Enter coupon code"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary uppercase tracking-wide"
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={couponLoading || !couponInput.trim()}
                        className="px-4 py-2 bg-knef-primary text-white text-sm rounded-lg hover:bg-opacity-90 disabled:opacity-50"
                      >
                        {couponLoading ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                      </button>
                    </div>
                    {couponError && <p className="text-xs text-red-600">{couponError}</p>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Gift Card */}
          <div className={cn("mt-3 border border-gray-200 rounded-xl overflow-hidden bg-white", appliedGiftCard && "hidden")}>
            {!appliedGiftCard && (
              <>
                <button
                  type="button"
                  onClick={() => setShowGiftCardInput(!showGiftCardInput)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2"><Gift size={14} className="text-blue-500" /> Redeem Gift Card/Voucher? Click here to enter your code</span>
                  <ChevronDown size={14} className={cn('transition-transform', showGiftCardInput && 'rotate-180')} />
                </button>
                {showGiftCardInput && (
                  <div className="px-4 pb-4 space-y-2 border-t border-gray-100">
                    <div className="flex gap-2 mt-3">
                      <input
                        type="text"
                        value={giftCardInput}
                        onChange={(e) => { setGiftCardInput(e.target.value.toUpperCase()); setGiftCardError(''); }}
                        placeholder="e.g. GC-XXXX-XXXX-XXXX"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 uppercase tracking-wide font-mono"
                      />
                      <button
                        type="button"
                        onClick={applyGiftCard}
                        disabled={giftCardLoading || !giftCardInput.trim()}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {giftCardLoading ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                      </button>
                    </div>
                    {giftCardError && <p className="text-xs text-red-600">{giftCardError}</p>}
                  </div>
                )}
              </>
            )}
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

          {/* Terms and Conditions */}
          {!pendingPayment && (
            <label
              className={cn(
                'mt-5 flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors',
                termsAccepted ? 'border-knef-primary/40 bg-knef-primary/5' : 'border-gray-200 bg-white hover:border-gray-300',
              )}
            >
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => {
                  setTermsAccepted(e.target.checked);
                  setSubmitError('');
                }}
                className="sr-only peer"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-knef-primary peer-focus-visible:ring-offset-2',
                  termsAccepted ? 'bg-knef-primary border-knef-primary' : 'border-gray-300 bg-white',
                )}
              >
                {termsAccepted && <Check size={13} className="text-white" strokeWidth={3} />}
              </span>
              <span className="text-sm text-gray-600 leading-relaxed">
                I have read and agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-knef-primary hover:underline">
                  Terms and Conditions
                </a>
                ,{' '}
                <a href="/returns" target="_blank" rel="noopener noreferrer" className="font-medium text-knef-primary hover:underline">
                  Returns Policy
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-knef-primary hover:underline">
                  Privacy Policy
                </a>
                . <span className="text-red-500">*</span>
              </span>
            </label>
          )}

          {/* Error */}
          {submitError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
          )}

          {pendingPayment ? (
            // Order exists and is waiting for its card payment — never create a second order here.
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm text-amber-900">
                Order <strong className="font-mono">{orderRef}</strong> is saved and waiting for a card payment of{' '}
                <strong>{formatNGN(pendingPayment.amountDue)}</strong>.
              </p>
              <button
                type="button"
                onClick={() => openPaystack(pendingPayment)}
                disabled={verifyingPayment}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-knef-primary text-white rounded-xl font-bold hover:bg-opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Pay now
              </button>
              <button
                type="button"
                onClick={() => confirmPayment(pendingPayment.reference)}
                disabled={verifyingPayment}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-amber-900 hover:underline disabled:opacity-60"
              >
                {verifyingPayment ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Checking your payment…
                  </>
                ) : (
                  "I've paid — check my payment"
                )}
              </button>
            </div>
          ) : (
            <button
              form="checkout-form"
              type="submit"
              disabled={placeMutation.isPending || (!!SITE_KEY && !turnstileToken) || !termsAccepted || podBlocked}
              className="mt-5 w-full flex items-center justify-center gap-2 py-4 bg-knef-primary text-white rounded-xl font-bold text-base hover:bg-opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {placeMutation.isPending ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Placing Order…
                </>
              ) : watchPaymentMethod === 'PAYSTACK' ? (
                <>
                  <Lock size={18} />
                  Place Order &amp; Pay {formatNGN(finalTotal)}
                </>
              ) : (
                'Place Order'
              )}
            </button>
          )}

          <p className="flex items-center justify-center gap-1.5 text-xs text-center text-gray-400 mt-3">
            <ShieldCheck size={13} />
            Online payments are processed securely by Paystack. We never see your card details.
          </p>
        </div>
      </div>
    </div>
  );
}
