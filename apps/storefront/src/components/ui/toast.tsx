'use client';

import { useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

let _addToast: ((toast: Omit<Toast, 'id'>) => void) | null = null;

export function toast(type: 'success' | 'error', message: string) {
  if (_addToast) {
    _addToast({ type, message });
  }
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    _addToast = addToast;
    return () => {
      _addToast = null;
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm animate-fade-in',
            t.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800',
          )}
        >
          {t.type === 'success' ? (
            <CheckCircle size={16} className="shrink-0 text-green-600 mt-0.5" />
          ) : (
            <XCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
          )}
          <p className="flex-1">{t.message}</p>
          <button
            onClick={() =>
              setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }
            className="shrink-0 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
