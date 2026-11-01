'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { searchProducts } from '@/lib/api';
import { ProductGrid } from '@/components/product/product-grid';
import { Pagination } from '@/components/ui/pagination';

function SearchContent() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get('q') ?? '';

  const [inputValue, setInputValue] = useState(initialQ);
  const [query, setQuery] = useState(initialQ);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setQuery(initialQ);
    setInputValue(initialQ);
    setPage(1);
  }, [initialQ]);

  const { data, isLoading } = useQuery({
    queryKey: ['search', query, page],
    queryFn: () => searchProducts(query, page, 20),
    enabled: query.trim().length > 0,
    placeholderData: (prev) => prev,
  });

  const products = data?.data ?? [];
  const meta = data?.meta as { total: number; page: number; limit: number; totalPages: number } | undefined;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = inputValue.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search bar */}
      <div className="max-w-2xl mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Search</h1>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search phones, accessories..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-knef-primary bg-white"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-knef-primary text-white rounded-xl text-sm font-medium hover:bg-opacity-90 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Results */}
      {query ? (
        <>
          <div className="mb-6">
            <p className="text-gray-500 text-sm">
              {isLoading
                ? 'Searching...'
                : meta
                ? `${meta.total} result${meta.total !== 1 ? 's' : ''} for "${query}"`
                : `No results for "${query}"`}
            </p>
          </div>

          <ProductGrid
            products={products}
            isLoading={isLoading}
            emptyMessage={`No products found for "${query}"`}
          />

          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
        </>
      ) : (
        <div className="text-center py-20 text-gray-400">
          <Search size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Type something to search</p>
          <p className="text-sm mt-1">
            Try &quot;iPhone&quot;, &quot;Samsung&quot;, &quot;charger&quot;…
          </p>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}
