'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import {
  ShoppingCart,
  ChevronLeft,
  Package,
  Check,
  Minus,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { fetchProduct } from '@/lib/api';
import { formatNGN, cn } from '@/lib/utils';
import { useCartStore } from '@/stores/cart.store';
import { toast } from '@/components/ui/toast';
import type { ProductVariant } from '@/types';

function SkeletonDetail() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="h-4 w-32 skeleton rounded mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="aspect-square skeleton rounded-2xl" />
        <div className="space-y-4">
          <div className="h-6 skeleton rounded w-3/4" />
          <div className="h-8 skeleton rounded w-40" />
          <div className="h-4 skeleton rounded" />
          <div className="h-4 skeleton rounded w-5/6" />
          <div className="h-12 skeleton rounded mt-6" />
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id),
  });

  if (isLoading) return <SkeletonDetail />;

  if (isError || !data?.data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Product not found</h2>
        <Link href="/products" className="text-knef-primary hover:underline text-sm">
          Back to products
        </Link>
      </div>
    );
  }

  const product = data.data;

  const activeVariant = selectedVariant;
  const displayPrice = activeVariant
    ? parseFloat(activeVariant.sellingPrice)
    : parseFloat(product.sellingPrice);
  const comparePrice = product.comparePrice ? parseFloat(product.comparePrice) : null;
  const hasDiscount =
    !activeVariant && comparePrice && comparePrice > displayPrice;

  const totalAvailable = product.inventoryByLocation.reduce(
    (sum, l) => sum + l.available,
    0,
  );
  const isOutOfStock = product.stock !== null && totalAvailable <= 0;
  const inCartQty = cartItems.find(
    (i) => i.productId === product.id && (i.variantId ?? null) === (activeVariant?.id ?? null),
  )?.quantity ?? 0;
  const maxQty = product.stock !== null ? Math.max(0, Math.min(totalAvailable - inCartQty, 20)) : 20;

  const images =
    product.images.length > 0
      ? product.images
      : product.primaryImage
      ? [{ url: product.primaryImage.url, altText: product.name }]
      : [];

  function handleAddToCart() {
    if (isOutOfStock || added) return;

    addItem({
      productId: product.id,
      variantId: activeVariant?.id ?? null,
      name: product.name,
      sku: activeVariant?.sku ?? product.sku,
      variantName: activeVariant?.name ?? null,
      unitPrice: displayPrice,
      quantity,
      imageUrl: images[0]?.url ?? null,
      stock: totalAvailable,
    });

    setAdded(true);
    toast('success', `${product.name} added to cart`);
    setTimeout(() => setAdded(false), 3000);
  }

  function handleBuyNow() {
    handleAddToCart();
    router.push('/cart');
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-8">
        <Link href="/products" className="hover:text-knef-primary flex items-center gap-1">
          <ChevronLeft size={14} />
          Products
        </Link>
        {product.category && (
          <>
            <span>/</span>
            <Link
              href={`/products?categoryId=${product.category.id}`}
              className="hover:text-knef-primary"
            >
              {product.category.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-gray-800 truncate max-w-[200px]">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Images */}
        <div>
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-white border border-gray-100">
            {images.length > 0 ? (
              <Image
                src={images[selectedImage]?.url ?? images[0].url}
                alt={product.name}
                fill
                priority
                unoptimized
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain p-6"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package size={80} className="text-gray-200" />
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={cn(
                    'shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors',
                    idx === selectedImage
                      ? 'border-knef-primary'
                      : 'border-gray-100 hover:border-gray-300',
                  )}
                >
                  <Image
                    src={img.url}
                    alt={`${product.name} image ${idx + 1}`}
                    width={64}
                    height={64}
                    unoptimized
                    className="object-contain w-full h-full"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-5">
          {product.brand && (
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">
              {product.brand.name}
            </p>
          )}

          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            {product.name}
          </h1>

          {/* Price */}
          <div className="flex items-end gap-3">
            <span className="text-3xl font-extrabold text-knef-primary">
              {formatNGN(displayPrice)}
            </span>
            {hasDiscount && (
              <span className="text-lg text-gray-400 line-through">
                {formatNGN(comparePrice!)}
              </span>
            )}
            {hasDiscount && (
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-sm font-semibold">
                Save{' '}
                {Math.round(
                  ((comparePrice! - displayPrice) / comparePrice!) * 100,
                )}
                %
              </span>
            )}
          </div>

          {/* Stock badge */}
          <div>
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-sm font-medium">
                <AlertCircle size={14} />
                Out of stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-sm font-medium">
                <Check size={14} />
                {totalAvailable <= 10
                  ? `Only ${totalAvailable} left`
                  : 'In stock'}
              </span>
            )}
          </div>

          {/* Short description */}
          {product.shortDesc && (
            <p className="text-gray-600 text-sm leading-relaxed">
              {product.shortDesc}
            </p>
          )}

          {/* Variants */}
          {product.variants.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Select variant:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedVariant(null)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                    !activeVariant
                      ? 'border-knef-primary bg-knef-primary text-white'
                      : 'border-gray-200 text-gray-600 hover:border-knef-primary',
                  )}
                >
                  Default
                </button>
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                      activeVariant?.id === v.id
                        ? 'border-knef-primary bg-knef-primary text-white'
                        : 'border-gray-200 text-gray-600 hover:border-knef-primary',
                    )}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          {!isOutOfStock && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Quantity:</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="w-10 text-center font-semibold text-gray-900">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock || maxQty === 0}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all',
                isOutOfStock
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : added
                  ? 'bg-green-600 text-white'
                  : 'bg-knef-primary text-white hover:bg-opacity-90',
              )}
            >
              {added ? (
                <>
                  <Check size={18} />
                  Added to Cart
                </>
              ) : (
                <>
                  <ShoppingCart size={18} />
                  Add to Cart
                </>
              )}
            </button>
            {added ? (
              <Link
                href="/cart"
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-knef-primary text-white hover:bg-opacity-90 transition-colors"
              >
                <ShoppingCart size={18} />
                View Cart
              </Link>
            ) : !isOutOfStock ? (
              <button
                onClick={handleBuyNow}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-knef-secondary text-knef-primary hover:bg-amber-400 transition-colors"
              >
                Buy Now
              </button>
            ) : null}
          </div>

          {/* SKU */}
          <p className="text-xs text-gray-400 font-mono">
            SKU: {activeVariant?.sku ?? product.sku}
          </p>

          {/* Full description */}
          {product.description && (
            <div className="border-t border-gray-100 pt-5">
              <h3 className="font-semibold text-gray-900 mb-3">Description</h3>
              <div
                className="prose prose-sm prose-gray max-w-none text-gray-600"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
