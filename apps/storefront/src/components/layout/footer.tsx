'use client';

import Link from 'next/link';
import { MapPin, Phone, Mail } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchStorefrontSettings } from '@/lib/api';

const DEFAULT_STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? 'KNEF Gadgets';
const YEAR = new Date().getFullYear();

export function Footer() {
  const { data: settings = {} } = useQuery({
    queryKey: ['storefront-settings'],
    queryFn: fetchStorefrontSettings,
    staleTime: 60_000,
  });

  const STORE_NAME = settings.storeName || DEFAULT_STORE_NAME;
  const logoSrc = settings.logoUrl || '/logo.png';
  const description = settings.footerDescription || 'Your trusted destination for smartphones, gadgets, and consumer electronics in Lagos, Nigeria. Genuine products, competitive prices.';
  const address = settings.footerAddress || 'Lagos, Nigeria';
  const phone = settings.footerPhone || '+234 800 000 0000';
  const email = settings.footerEmail || 'info@knefgadgets.com';

  return (
    <footer className="bg-knef-primary text-white mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt={STORE_NAME} className="h-24 w-auto object-contain brightness-0 invert" />
            </div>
            <p className="text-blue-200 text-sm leading-relaxed max-w-sm">
              {description}
            </p>
            <div className="mt-4 space-y-2 text-sm text-blue-200">
              <div className="flex items-center gap-2">
                <MapPin size={14} />
                <span>{address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} />
                <a href={`tel:${phone.replace(/\s/g, '')}`} className="hover:text-white transition-colors">
                  {phone}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={14} />
                <a href={`mailto:${email}`} className="hover:text-white transition-colors">
                  {email}
                </a>
              </div>
            </div>
          </div>

          {/* Shop */}
          <div>
            <h4 className="font-semibold mb-4 text-knef-secondary">Shop</h4>
            <ul className="space-y-2 text-sm text-blue-200">
              <li>
                <Link href="/products" className="hover:text-white transition-colors">
                  All Products
                </Link>
              </li>
              <li>
                <Link href="/categories" className="hover:text-white transition-colors">
                  Categories
                </Link>
              </li>
              <li>
                <Link href="/products?inStock=true" className="hover:text-white transition-colors">
                  In Stock
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4 text-knef-secondary">Support</h4>
            <ul className="space-y-2 text-sm text-blue-200">
              <li>
                <Link href="/order" className="hover:text-white transition-colors">
                  Track Your Order
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-white transition-colors">
                  View Cart
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/returns" className="hover:text-white transition-colors">
                  Returns Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-blue-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-blue-300">
          <p>&copy; {YEAR} {STORE_NAME}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <span className="text-blue-700">·</span>
            <Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
