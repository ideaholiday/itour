'use client';

import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id?: string;
  type: 'error' | 'success' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
  autoCloseMs?: number;
}

export function Toast({ toast, onClose, autoCloseMs = 5000 }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, autoCloseMs);
    return () => clearTimeout(timer);
  }, [toast, onClose, autoCloseMs]);

  if (!toast) return null;

  const isError = toast.type === 'error';
  const isSuccess = toast.type === 'success';

  return (
    <div className="fixed top-5 right-5 z-50 max-w-md w-full animate-in fade-in slide-in-from-top-5 duration-200">
      <div
        className={`flex items-start p-4 rounded-xl border shadow-lg backdrop-blur-md transition-all ${
          isError
            ? 'bg-rose-950/90 border-rose-800 text-rose-100'
            : isSuccess
            ? 'bg-emerald-950/90 border-emerald-800 text-emerald-100'
            : 'bg-slate-900/90 border-slate-700 text-slate-100'
        }`}
      >
        <div className="flex-shrink-0 mr-3 mt-0.5">
          {isError && <AlertCircle className="w-5 h-5 text-rose-400" />}
          {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {!isError && !isSuccess && <Info className="w-5 h-5 text-sky-400" />}
        </div>

        <div className="flex-1 mr-2">
          <h4 className="text-sm font-semibold leading-5">{toast.title}</h4>
          {toast.message && (
            <p className="mt-1 text-xs opacity-90 leading-4">{toast.message}</p>
          )}
        </div>

        <button
          onClick={onClose}
          type="button"
          className="flex-shrink-0 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
