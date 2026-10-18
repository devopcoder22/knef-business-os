'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { customerRegister } from '@/lib/api';
import { useCustomerStore } from '@/stores/customer.store';
import { cn } from '@/lib/utils';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().max(20).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useCustomerStore((s) => s.setAuth);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setError('');
    try {
      const result = await customerRegister({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || undefined,
        password: data.password,
        turnstileToken: turnstileToken ?? undefined,
      });
      setAuth(result.customer, result.accessToken, result.refreshToken);
      router.push('/account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    }
  }

  const field = (name: keyof FormData, label: string, type = 'text', autoComplete?: string, required = true) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{!required && <span className="text-gray-400 ml-1">(optional)</span>}
      </label>
      <input
        {...register(name)}
        id={name}
        type={type}
        autoComplete={autoComplete}
        className={cn(
          'w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
          errors[name] ? 'border-red-300' : 'border-gray-300',
        )}
      />
      {errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name]!.message as string}</p>}
    </div>
  );

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-2 text-sm text-gray-500">
            Already have one?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">Sign in</Link>
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {field('firstName', 'First name', 'text', 'given-name')}
              {field('lastName', 'Last name', 'text', 'family-name')}
            </div>
            {field('email', 'Email address', 'email', 'email')}
            {field('phone', 'Phone number', 'tel', 'tel', false)}
            {field('password', 'Password', 'password', 'new-password')}
            {field('confirmPassword', 'Confirm password', 'password', 'new-password')}

            {SITE_KEY && (
              <Turnstile siteKey={SITE_KEY} onSuccess={setTurnstileToken} onError={() => setTurnstileToken(null)} onExpire={() => setTurnstileToken(null)} />
            )}

            <button
              type="submit"
              disabled={isSubmitting || (!!SITE_KEY && !turnstileToken)}
              className="w-full bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
