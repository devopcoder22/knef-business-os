'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Search, Menu, X, User } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCartStore } from '@/stores/cart.store';
import { useCustomerStore } from '@/stores/customer.store';
import { fetchStorefrontSettings } from '@/lib/api';
import { cn } from '@/lib/utils';

const DEFAULT_STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? 'KNEF Gadgets';

export function Header() {
  const router = useRouter();
  const totalItems = useCartStore((s) => s.totalItems());
  const { customer, isAuthenticated } = useCustomerStore();
  const [storeHydrated, setStoreHydrated] = useState(false);

  useEffect(() => {
    if (useCustomerStore.persist.hasHydrated()) {
      setStoreHydrated(true);
      return;
    }
    const unsub = useCustomerStore.persist.onFinishHydration(() => setStoreHydrated(true));
    return unsub;
  }, []);

  const { data: settings = {} } = useQuery({
    queryKey: ['storefront-settings'],
    queryFn: fetchStorefrontSettings,
    staleTime: 60_000,
  });

  const STORE_NAME = settings.storeName || DEFAULT_STORE_NAME;
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus();
    }
  }, [searchOpen]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/products', label: 'All Products' },
    { href: '/categories', label: 'Categories' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.logoUrl || '/logo.png'}
              alt={STORE_NAME}
              className="h-14 w-auto object-contain max-w-[220px]"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-600 hover:text-knef-primary transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* WhatsApp CTA */}
            {settings.whatsappEnabled && settings.whatsappNumber && (() => {
              const digits = settings.whatsappNumber.replace(/\D/g, '');
              const msg = settings.whatsappMessage ? `?text=${encodeURIComponent(settings.whatsappMessage)}` : '';
              const href = `https://wa.me/${digits}${msg}`;
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Contact KNEF Gadgets on WhatsApp"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <span className="hidden sm:inline">WhatsApp Us</span>
                </a>
              );
            })()}

            {/* Search toggle */}
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className="p-2 rounded-lg text-gray-500 hover:text-knef-primary hover:bg-gray-50 transition-colors"
              aria-label="Search"
            >
              <Search size={20} />
            </button>

            {/* Account */}
            {!storeHydrated ? (
              <div className="hidden md:block w-20 h-8" />
            ) : isAuthenticated && customer ? (
              <Link
                href="/account"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:text-knef-primary hover:bg-gray-50 transition-colors"
                aria-label="My account"
              >
                <User size={16} />
                <span>{customer.firstName}</span>
              </Link>
            ) : (
              <Link
                href="/login"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:text-knef-primary hover:bg-gray-50 transition-colors border border-gray-200"
              >
                <User size={15} />
                Sign in
              </Link>
            )}

            {/* Cart */}
            <Link
              href="/cart"
              className="relative p-2 rounded-lg text-gray-500 hover:text-knef-primary hover:bg-gray-50 transition-colors"
              aria-label="Cart"
            >
              <ShoppingCart size={20} />
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-knef-secondary text-white text-xs font-bold flex items-center justify-center leading-none">
                  {totalItems > 99 ? '99+' : totalItems}
                </span>
              )}
            </Link>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Inline search bar */}
        {searchOpen && (
          <div className="pb-3 animate-fade-in">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search phones, accessories..."
                className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-knef-primary text-white rounded-lg text-sm font-medium hover:bg-opacity-90 transition-colors"
              >
                Search
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white animate-fade-in">
          <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-knef-primary transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {storeHydrated && isAuthenticated && customer ? (
              <Link
                href="/account"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-knef-primary transition-colors flex items-center gap-2"
              >
                <User size={15} />
                My Account ({customer.firstName})
              </Link>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-knef-primary transition-colors flex items-center gap-2"
              >
                <User size={15} />
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
