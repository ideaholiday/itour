'use client';

import React, { useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import { Loader2 } from 'lucide-react';

interface GoogleAuthButtonProps {
  role?: 'user' | 'supplier';
  redirectTo?: string;
  onError?: (errorMsg: string) => void;
  label?: string;
}

export function GoogleAuthButton({
  role = 'user',
  redirectTo,
  onError,
  label = 'Continue with Google',
}: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      const supabase = createClient();
      const origin = window.location.origin;

      let callbackUrl = `${origin}/auth/callback?role=${role}`;
      if (redirectTo) {
        callbackUrl += `&next=${encodeURIComponent(redirectTo)}`;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        throw error;
      }
    } catch (err: any) {
      setIsLoading(false);
      if (onError) {
        onError(err.message || 'Failed to initialize Google Sign-In');
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      aria-busy={isLoading}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-700 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 font-medium text-sm transition-all hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
      )}
      <span>{isLoading ? 'Connecting to Google...' : label}</span>
    </button>
  );
}
