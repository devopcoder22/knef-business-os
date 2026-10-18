'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser } from '@knef/types';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  hasAllPermissions: (...permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;
  updateToken: (token: string) => void;
}

let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(clearAuthFn: () => void) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(clearAuthFn, IDLE_TIMEOUT_MS);
}

function startIdleWatcher(clearAuthFn: () => void) {
  if (typeof window === 'undefined') return;
  const events = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'];
  const handler = () => resetIdleTimer(clearAuthFn);
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
  resetIdleTimer(clearAuthFn);
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user: AuthUser, token: string) => {
        set({ user, accessToken: token, isAuthenticated: true });
        startIdleWatcher(() => get().clearAuth());
      },

      clearAuth: () => {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      hasPermission: (permission: string): boolean => {
        const { user } = get();
        if (!user) return false;
        return user.permissions.includes(permission);
      },

      hasAnyPermission: (...permissions: string[]): boolean => {
        const { user } = get();
        if (!user) return false;
        return permissions.some((p) => user.permissions.includes(p));
      },

      hasAllPermissions: (...permissions: string[]): boolean => {
        const { user } = get();
        if (!user) return false;
        return permissions.every((p) => user.permissions.includes(p));
      },

      hasRole: (role: string): boolean => {
        const { user } = get();
        if (!user) return false;
        return user.roles.includes(role);
      },

      updateToken: (token: string) => {
        set({ accessToken: token });
      },
    }),
    {
      name: 'knef-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.isAuthenticated) {
          startIdleWatcher(() => state.clearAuth());
        }
      },
    },
  ),
);
