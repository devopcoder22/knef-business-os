'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Smartphone, Grid3X3 } from 'lucide-react';
import { fetchCategories } from '@/lib/api';
import type { Category } from '@/types';

function SkeletonCategory() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="h-32 skeleton" />
      <div className="p-4">
        <div className="h-5 skeleton rounded w-3/4 mb-2" />
        <div className="h-3 skeleton rounded" />
        <div className="h-3 skeleton rounded w-5/6 mt-1" />
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const categories = data?.data ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Shop by Category</h1>
        <p className="text-gray-500 mt-2">
          Find exactly what you&apos;re looking for.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCategory key={i} />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <Grid3X3 size={48} className="mb-4 opacity-40" />
          <p className="text-lg font-medium">No categories yet</p>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map((cat: Category) => (
            <div key={cat.id}>
              {/* Parent category */}
              <div className="flex items-center gap-3 mb-4">
                <Link
                  href={`/products?categoryId=${cat.id}`}
                  className="flex items-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-knef-primary/10 flex items-center justify-center group-hover:bg-knef-primary transition-colors">
                    <Smartphone
                      size={18}
                      className="text-knef-primary group-hover:text-white transition-colors"
                    />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 group-hover:text-knef-primary transition-colors">
                      {cat.name}
                    </h2>
                    {cat.description && (
                      <p className="text-sm text-gray-500">{cat.description}</p>
                    )}
                  </div>
                </Link>
              </div>

              {/* Subcategories */}
              {cat.children && cat.children.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 ml-13 pl-13">
                  {cat.children.map((sub) => (
                    <Link
                      key={sub.id}
                      href={`/products?categoryId=${sub.id}`}
                      className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-gray-100 hover:border-knef-primary hover:shadow-sm transition-all text-center"
                    >
                      <div className="w-12 h-12 rounded-full bg-gray-50 group-hover:bg-knef-primary/10 transition-colors flex items-center justify-center overflow-hidden">
                        {sub.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={sub.imageUrl}
                            alt={sub.name}
                            className="w-10 h-10 object-contain"
                          />
                        ) : (
                          <Smartphone
                            size={20}
                            className="text-gray-400 group-hover:text-knef-primary transition-colors"
                          />
                        )}
                      </div>
                      <span className="text-xs font-medium text-gray-700 group-hover:text-knef-primary transition-colors">
                        {sub.name}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1">
                  <Link
                    href={`/products?categoryId=${cat.id}`}
                    className="inline-flex items-center gap-1.5 text-sm text-knef-primary hover:underline ml-13 pl-13"
                  >
                    Browse {cat.name} products
                  </Link>
                </div>
              )}

              <hr className="mt-8 border-gray-100" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
