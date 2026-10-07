'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from '@/types';

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, qty: number) => void;
  clearCart: () => void;
  totalItems: () => number;
  totalAmount: () => number;
}

function sameItem(
  a: CartItem,
  productId: string,
  variantId: string | null,
): boolean {
  return a.productId === productId && (a.variantId ?? null) === variantId;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find((i) =>
            sameItem(i, item.productId, item.variantId),
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                sameItem(i, item.productId, item.variantId)
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i,
              ),
            };
          }
          return { items: [...state.items, item] };
        });
      },

      removeItem: (productId, variantId) => {
        set((state) => ({
          items: state.items.filter((i) => !sameItem(i, productId, variantId)),
        }));
      },

      updateQuantity: (productId, variantId, qty) => {
        if (qty <= 0) {
          get().removeItem(productId, variantId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            sameItem(i, productId, variantId) ? { ...i, quantity: qty } : i,
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      totalAmount: () =>
        get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    }),
    { name: 'knef-cart' },
  ),
);
