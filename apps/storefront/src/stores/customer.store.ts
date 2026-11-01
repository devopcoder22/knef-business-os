'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CustomerInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface CustomerStore {
  customer: CustomerInfo | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  setAuth: (customer: CustomerInfo, accessToken: string, refreshToken: string) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

export const useCustomerStore = create<CustomerStore>()(
  persist(
    (set) => ({
      customer: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (customer, accessToken, refreshToken) => {
        set({ customer, accessToken, refreshToken, isAuthenticated: true });
        // Write token to cookie so Next.js middleware can check it
        setCookie('knef-customer-token', accessToken, 1);
      },

      updateTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken });
        setCookie('knef-customer-token', accessToken, 1);
      },

      clearAuth: () => {
        set({ customer: null, accessToken: null, refreshToken: null, isAuthenticated: false });
        deleteCookie('knef-customer-token');
      },
    }),
    {
      name: 'knef-customer',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        customer: state.customer,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
