'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, Package } from 'lucide-react';
import { useCartStore } from '@/stores/cart.store';
import { formatNGN } from '@/lib/utils';

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const totalAmount = useCartStore((s) => s.totalAmount());
  const totalItems = useCartStore((s) => s.totalItems());

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <ShoppingCart size={64} className="mx-auto text-gray-200 mb-6" />
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Your cart is empty</h1>
        <p className="text-gray-500 mb-8">
          Browse our collection and add items you love.
        </p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 px-6 py-3 bg-knef-primary text-white rounded-xl font-semibold hover:bg-opacity-90 transition-colors"
        >
          Start Shopping
          <ArrowRight size={18} />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        Shopping Cart
        <span className="ml-2 text-base font-normal text-gray-400">
          ({totalItems} item{totalItems !== 1 ? 's' : ''})
        </span>
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <div
              key={`${item.productId}-${item.variantId}`}
              className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-4"
            >
              {/* Image */}
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 shrink-0">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    width={80}
                    height={80}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package size={28} className="text-gray-300" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/products/${item.productId}`}
                  className="font-semibold text-gray-900 hover:text-knef-primary transition-colors text-sm leading-snug line-clamp-2"
                >
                  {item.name}
                </Link>
                {item.variantName && (
                  <p className="text-xs text-gray-400 mt-0.5">{item.variantName}</p>
                )}
                <p className="text-xs text-gray-400 font-mono mt-0.5">{item.sku}</p>

                <div className="flex items-center justify-between mt-3">
                  {/* Quantity */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        updateQuantity(
                          item.productId,
                          item.variantId,
                          item.quantity - 1,
                        )
                      }
                      className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-8 text-center text-sm font-medium text-gray-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => {
                        const max = item.stock !== null ? item.stock : 999;
                        if (item.quantity < max) {
                          updateQuantity(
                            item.productId,
                            item.variantId,
                            item.quantity + 1,
                          );
                        }
                      }}
                      disabled={
                        item.stock !== null && item.quantity >= item.stock
                      }
                      className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Price */}
                  <p className="font-bold text-knef-primary">
                    {formatNGN(item.unitPrice * item.quantity)}
                  </p>
                </div>
              </div>

              {/* Remove */}
              <button
                onClick={() => removeItem(item.productId, item.variantId)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                title="Remove"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 sticky top-24">
            <h2 className="font-bold text-gray-900 mb-4">Order Summary</h2>

            <div className="space-y-3 text-sm">
              {items.map((item) => (
                <div
                  key={`${item.productId}-${item.variantId}`}
                  className="flex justify-between text-gray-600"
                >
                  <span className="truncate pr-2">
                    {item.name}
                    {item.variantName ? ` (${item.variantName})` : ''}
                    {' '}× {item.quantity}
                  </span>
                  <span className="shrink-0 font-medium text-gray-900">
                    {formatNGN(item.unitPrice * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 my-4" />

            <div className="flex justify-between items-center font-bold text-lg text-gray-900">
              <span>Total</span>
              <span className="text-knef-primary">{formatNGN(totalAmount)}</span>
            </div>

            <Link
              href="/checkout"
              className="mt-5 flex items-center justify-center gap-2 w-full py-3 bg-knef-primary text-white rounded-xl font-semibold hover:bg-opacity-90 transition-colors"
            >
              Proceed to Checkout
              <ArrowRight size={18} />
            </Link>

            <Link
              href="/products"
              className="mt-3 flex items-center justify-center text-sm text-gray-500 hover:text-knef-primary transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
