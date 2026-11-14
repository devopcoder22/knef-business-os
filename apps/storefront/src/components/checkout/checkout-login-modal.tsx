'use client';

import { useEffect, useRef, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Eye, EyeOff, Loader2, Lock, Mail, UserRound, X } from 'lucide-react';
import { customerLogin } from '@/lib/api';
import type { AuthResult } from '@/lib/api';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

/**
 * Sign in without leaving checkout, so the customer keeps their cart, details and verified
 * phone/email. The parent stores the session; nothing on the page is reset.
 */
export function CheckoutLoginModal({
  open,
  initialEmail,
  notice,
  onClose,
  onSuccess,
}: {
  open: boolean;
  initialEmail?: string;
  /** Optional context, e.g. "An account already exists for this email." */
  notice?: string;
  onClose: () => void;
  onSuccess: (result: AuthResult) => void;
}) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  // Latest props without re-running the open effect (which would wipe what the user typed).
  const latest = useRef({ initialEmail, onClose });
  latest.current = { initialEmail, onClose };

  useEffect(() => {
    if (!open) return;
    setEmail(latest.current.initialEmail ?? '');
    setPassword('');
    setError('');
    setTurnstileToken(null);
    // Email is usually already typed at checkout; jump straight to the password.
    const t = setTimeout(() => passwordRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && latest.current.onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await customerLogin({
        email: email.trim(),
        password,
        turnstileToken: turnstileToken ?? undefined,
      });
      if (!result?.customer || !result.accessToken) throw new Error('Sign in failed. Please try again.');
      onSuccess(result);
    } catch (err) {
      setError((err as Error).message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-login-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={18} />
        </button>

        <div className="w-12 h-12 rounded-xl bg-knef-primary/10 flex items-center justify-center mb-4">
          <UserRound size={22} className="text-knef-primary" />
        </div>
        <h3 id="checkout-login-title" className="text-lg font-bold text-gray-900">
          Welcome back
        </h3>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          {notice ?? 'Sign in to continue. Your cart and checkout details will stay as they are.'}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="checkout-login-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="checkout-login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="checkout-login-password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <a
                href="/forgot-password"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-knef-primary hover:underline"
              >
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="checkout-login-password"
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl pl-10 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {SITE_KEY && (
            <Turnstile
              siteKey={SITE_KEY}
              onSuccess={setTurnstileToken}
              onError={() => setTurnstileToken(null)}
              onExpire={() => setTurnstileToken(null)}
            />
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading || (!!SITE_KEY && !turnstileToken)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-knef-primary text-white rounded-xl font-semibold text-sm hover:bg-opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Signing in…
              </>
            ) : (
              'Sign in & Continue'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
