'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight, Compass } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { loginSchema, type LoginFormValues } from '../../lib/validations/auth';
import { GoogleAuthButton } from './GoogleAuthButton';
import { Toast, type ToastMessage } from '../ui/Toast';
import IdeaHolidayLogo from '../ui/IdeaHolidayLogo';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get('redirectTo') || undefined;

  const [formData, setFormData] = useState<LoginFormValues>({
    email: searchParams?.get('email') || '',
    password: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormValues, string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(() => {
    const errorParam = searchParams?.get('error');
    const registeredParam = searchParams?.get('registered');
    if (errorParam) {
      return { type: 'error', title: 'Authentication Failed', message: errorParam };
    }
    if (registeredParam) {
      return {
        type: 'success',
        title: 'Account Created Successfully!',
        message: 'Please log in with your credentials to access your Idea Holiday dashboard.',
      };
    }
    return null;
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof LoginFormValues]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setToast(null);

    // Validate with Zod
    const validation = loginSchema.safeParse(formData);
    if (!validation.success) {
      const formattedErrors: Partial<Record<keyof LoginFormValues, string>> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof LoginFormValues;
        if (field && !formattedErrors[field]) {
          formattedErrors[field] = issue.message;
        }
      });
      setErrors(formattedErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password,
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('User record not found following authentication.');
      }

      const role = data.user.user_metadata?.role || 'user';

      setToast({
        type: 'success',
        title: 'Login Successful',
        message: 'Redirecting to your dashboard...',
      });

      // Target redirect prioritization
      if (redirectTo && redirectTo.startsWith('/')) {
        router.push(redirectTo);
        return;
      }

      if (role === 'supplier') {
        router.push('/supplier/dashboard');
      } else if (role === 'admin') {
        router.push('/admin/dashboard');
      } else {
        router.push('/account/bookings');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setToast({
        type: 'error',
        title: 'Login Failed',
        message: err.message || 'Invalid email or password. Please check your credentials.',
      });
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Decorative Top Accent Gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500" />

        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-4">
            <Compass className="w-6 h-6 animate-pulse" />
          </div>
          <h1 className="flex flex-wrap items-baseline justify-center gap-2 text-2xl font-bold text-slate-100 tracking-tight">
            <span>Welcome back to</span> <IdeaHolidayLogo className="text-[1.1em]" />
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Sign in to access your bookings, itineraries, and fleet panel
          </p>
        </div>

        {/* Google OAuth Button */}
        <div className="mb-6">
          <GoogleAuthButton
            redirectTo={redirectTo}
            onError={(msg) => setToast({ type: 'error', title: 'Google Login Error', message: msg })}
          />
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center mb-6">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-xs uppercase tracking-wider text-slate-500 font-medium absolute">
            or continue with email
          </span>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Email Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="name@company.com"
                className={`w-full pl-10 pr-4 py-3 bg-slate-950/80 border rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                  errors.email
                    ? 'border-rose-600 focus:ring-rose-500/50'
                    : 'border-slate-800 focus:border-amber-500 focus:ring-amber-500/30'
                }`}
              />
            </div>
            {errors.email && <p className="mt-1.5 text-xs text-rose-400">{errors.email}</p>}
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-amber-400 hover:text-amber-300 hover:underline font-medium transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="••••••••••••"
                className={`w-full pl-10 pr-12 py-3 bg-slate-950/80 border rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                  errors.password
                    ? 'border-rose-600 focus:ring-rose-500/50'
                    : 'border-slate-800 focus:border-amber-500 focus:ring-amber-500/30'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="mt-1.5 text-xs text-rose-400">{errors.password}</p>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.99]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In to Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Toggle Link */}
        <div className="mt-6 pt-4 border-t border-slate-800 text-center text-sm text-slate-400">
          Don't have an account?{' '}
          <Link
            href={redirectTo ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}` : '/signup'}
            className="text-amber-400 font-semibold hover:text-amber-300 hover:underline transition-colors"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
