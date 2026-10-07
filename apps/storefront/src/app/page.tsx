'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Smartphone, Shield, Zap, Truck } from 'lucide-react';
import { fetchProducts, fetchCategories } from '@/lib/api';
import { ProductGrid } from '@/components/product/product-grid';
import type { Category } from '@/types';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? 'KNEF Gadgets';

const FEATURES = [
  {
    icon: Shield,
    title: 'Genuine Products',
    desc: '100% authentic smartphones and electronics from verified sources.',
  },
  {
    icon: Zap,
    title: 'Fast Checkout',
    desc: 'Simple, streamlined ordering — no account required.',
  },
  {
    icon: Truck,
    title: 'Lagos Delivery',
    desc: 'Same-day and next-day delivery within Lagos.',
  },
  {
    icon: Smartphone,
    title: 'Latest Models',
    desc: 'Always stocked with the newest releases and best sellers.',
  },
];

export default function HomePage() {
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['home-products'],
    queryFn: () => fetchProducts({ limit: 8, inStock: true }),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const products = productsData?.data ?? [];
  const categories = (categoriesData?.data ?? []).slice(0, 6);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-knef-primary via-blue-900 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-sm font-medium mb-6">
              <Zap size={14} className="text-knef-secondary" />
              <span>Lagos&apos;s trusted gadget store</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight mb-6">
              The best{' '}
              <span className="text-knef-secondary">smartphones</span> &amp;
              electronics in Lagos
            </h1>
            <p className="text-lg text-blue-200 mb-8 leading-relaxed">
              Shop from our wide selection of genuine smartphones, accessories
              and gadgets. Fast order processing, competitive prices.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/products"
                className="flex items-center gap-2 px-6 py-3 bg-knef-secondary text-knef-primary rounded-xl font-semibold hover:bg-amber-400 transition-colors"
              >
                Shop Now
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/categories"
                className="flex items-center gap-2 px-6 py-3 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/20 transition-colors border border-white/20"
              >
                Browse Categories
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-knef-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Shop by Category</h2>
            <Link
              href="/categories"
              className="text-sm font-medium text-knef-primary hover:underline flex items-center gap-1"
            >
              View all
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {categories.map((cat: Category) => (
              <Link
                key={cat.id}
                href={`/products?categoryId=${cat.id}`}
                className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-gray-100 hover:border-knef-primary hover:shadow-sm transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-blue-50 group-hover:bg-knef-primary transition-colors flex items-center justify-center text-2xl">
                  {cat.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cat.imageUrl}
                      alt={cat.name}
                      className="w-10 h-10 object-contain rounded-full"
                    />
                  ) : (
                    <Smartphone
                      size={20}
                      className="text-knef-primary group-hover:text-white transition-colors"
                    />
                  )}
                </div>
                <span className="text-xs font-medium text-gray-700 text-center group-hover:text-knef-primary transition-colors">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Featured Products</h2>
          <Link
            href="/products"
            className="text-sm font-medium text-knef-primary hover:underline flex items-center gap-1"
          >
            View all
            <ArrowRight size={14} />
          </Link>
        </div>
        <ProductGrid products={products} isLoading={productsLoading} />
      </section>

      {/* CTA banner */}
      <section className="bg-knef-secondary/10 border-t border-amber-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Ready to order? It&apos;s quick and easy.
          </h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            No account needed. Browse, add to cart, and place your order in
            minutes. We&apos;ll handle the rest.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-6 py-3 bg-knef-primary text-white rounded-xl font-semibold hover:bg-opacity-90 transition-colors"
          >
            Start Shopping
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
