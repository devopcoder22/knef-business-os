'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X } from 'lucide-react';
import { fetchProducts, fetchCategories } from '@/lib/api';
import { ProductGrid } from '@/components/product/product-grid';
import { Pagination } from '@/components/ui/pagination';
import type { Category } from '@/types';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

function ProductsContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState(params.get('categoryId') ?? '');
  const [inStock, setInStock] = useState(params.get('inStock') === 'true');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, categoryId, inStock],
    queryFn: () =>
      fetchProducts({
        page,
        limit: 20,
        categoryId: categoryId || undefined,
        inStock: inStock || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const products = data?.data ?? [];
  const meta = data?.meta as { total: number; page: number; limit: number; totalPages: number } | undefined;
  const categories = categoriesData?.data ?? [];

  const handleCategoryChange = useCallback(
    (id: string) => {
      setCategoryId(id);
      setPage(1);
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setCategoryId('');
    setInStock(false);
    setPage(1);
    router.replace('/products');
  }, [router]);

  const hasActiveFilters = Boolean(categoryId || inStock);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Products</h1>
          {meta && (
            <p className="text-sm text-gray-500 mt-1">
              {meta.total} product{meta.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <SlidersHorizontal size={16} />
          Filters
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-knef-secondary" />
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 animate-fade-in">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Category */}
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-knef-primary"
              >
                <option value="">All Categories</option>
                {categories.map((c: Category) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* In-stock toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(e) => {
                  setInStock(e.target.checked);
                  setPage(1);
                }}
                className="w-4 h-4 rounded border-gray-300 text-knef-primary focus:ring-knef-primary"
              />
              <span className="text-sm text-gray-700">In stock only</span>
            </label>

            {/* Clear */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                <X size={14} />
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Category quick-pills */}
      {categories.length > 0 && !showFilters && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          <button
            onClick={() => handleCategoryChange('')}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !categoryId
                ? 'bg-knef-primary text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-knef-primary hover:text-knef-primary'
            }`}
          >
            All
          </button>
          {categories.slice(0, 8).map((c: Category) => (
            <button
              key={c.id}
              onClick={() => handleCategoryChange(c.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                categoryId === c.id
                  ? 'bg-knef-primary text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-knef-primary hover:text-knef-primary'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <ProductGrid products={products} isLoading={isLoading} />

      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsContent />
    </Suspense>
  );
}
