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
                  <span className="hidden sm:inline">WhatsApp Us</span>
                  <span className="sm:hidden font-bold">WA</span>
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
