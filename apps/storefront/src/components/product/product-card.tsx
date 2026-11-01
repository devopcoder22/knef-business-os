'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShoppingCart, Package } from 'lucide-react';
import type { ProductListItem } from '@/types';
import { formatNGN, cn } from '@/lib/utils';
import { useCartStore } from '@/stores/cart.store';

interface ProductCardProps {
  product: ProductListItem;
}

export function ProductCard({ product }: ProductCardProps) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);

  const inCart = items.some(
    (i) => i.productId === product.id && i.variantId === null,
  );

  const isOutOfStock = product.stock !== null && product.stock <= 0;

  const hasDiscount =
    product.comparePrice !== null &&
    parseFloat(product.comparePrice) > parseFloat(product.sellingPrice);

  const discountPct = hasDiscount
    ? Math.round(
        ((parseFloat(product.comparePrice!) - parseFloat(product.sellingPrice)) /
          parseFloat(product.comparePrice!)) *
          100,
      )
    : 0;

  function handleCardClick() {
    router.push(`/products/${product.id}`);
  }

  function handleAddToCart(e: React.MouseEvent) {
    e.stopPropagation();
    if (isOutOfStock) return;
    addItem({
      productId: product.id,
      variantId: null,
      name: product.name,
      sku: product.sku,
      variantName: null,
      unitPrice: parseFloat(product.sellingPrice),
      quantity: 1,
      imageUrl: product.primaryImage?.url ?? null,
      stock: product.stock,
    });
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleCardClick();
      }}
      className="group bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col cursor-pointer"
    >
      {/* Image */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        {product.primaryImage ? (
          <Image
            src={product.primaryImage.url}
            alt={product.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={48} className="text-gray-300" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {isOutOfStock && (
            <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-xs font-semibold">
              Out of stock
            </span>
          )}
          {hasDiscount && !isOutOfStock && (
            <span className="px-2 py-0.5 rounded-md bg-knef-secondary text-white text-xs font-semibold">
              -{discountPct}%
            </span>
          )}
        </div>

        {/* Quick add — separate button, stops propagation so card click doesn't fire */}
        {!isOutOfStock && (
          <button
            type="button"
            onClick={handleAddToCart}
            className={cn(
              'absolute bottom-2 right-2 p-2 rounded-lg shadow-md text-sm font-medium transition-all duration-200',
              inCart
                ? 'bg-knef-accent text-white scale-100 opacity-100'
                : 'bg-knef-primary text-white opacity-0 group-hover:opacity-100',
            )}
            title={inCart ? 'In cart' : 'Add to cart'}
          >
            <ShoppingCart size={16} />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        {product.brand && (
          <p className="text-xs text-gray-400 uppercase tracking-wide">
            {product.brand.name}
          </p>
        )}
        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
          {product.name}
        </h3>

        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div>
            <p className="font-bold text-knef-primary text-base leading-tight">
              {formatNGN(product.sellingPrice)}
            </p>
            {hasDiscount && (
              <p className="text-xs text-gray-400 line-through">
                {formatNGN(product.comparePrice!)}
              </p>
            )}
          </div>
          {product.stock !== null && product.stock > 0 && product.stock <= 10 && (
            <p className="text-xs text-amber-600 font-medium">
              {product.stock} left
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
