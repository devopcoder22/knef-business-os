import Link from 'next/link';
import { Zap, MapPin, Phone, Mail } from 'lucide-react';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? 'KNEF Gadgets';
const YEAR = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="bg-knef-primary text-white mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-knef-secondary flex items-center justify-center">
                <Zap size={16} className="text-knef-primary" />
              </div>
              <span className="font-bold text-lg">{STORE_NAME}</span>
            </div>
            <p className="text-blue-200 text-sm leading-relaxed max-w-sm">
              Your trusted destination for smartphones, gadgets, and consumer
              electronics in Lagos, Nigeria. Genuine products, competitive prices.
            </p>
            <div className="mt-4 space-y-2 text-sm text-blue-200">
              <div className="flex items-center gap-2">
                <MapPin size={14} />
                <span>Lagos, Nigeria</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} />
                <a href="tel:+2348000000000" className="hover:text-white transition-colors">
                  +234 800 000 0000
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={14} />
                <a href="mailto:info@knef.ng" className="hover:text-white transition-colors">
                  info@knef.ng
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
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-blue-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-blue-300">
          <p>&copy; {YEAR} KNEF Technology & IT Solutions. All rights reserved.</p>
          <p>Powered by KNEF Business OS</p>
        </div>
      </div>
    </footer>
  );
}
