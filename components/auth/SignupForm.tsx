'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  User,
  Building2,
  Mail,
  Lock,
  Phone,
  MapPin,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  Compass,
  CheckCircle,
} from 'lucide-react';
import IdeaHolidayLogo from '../ui/IdeaHolidayLogo';
import { createClient } from '../../lib/supabase/client';
import {
  travelerSignupSchema,
  supplierSignupSchema,
} from '../../lib/validations/auth';
import { GoogleAuthButton } from './GoogleAuthButton';
import { Toast, type ToastMessage } from '../ui/Toast';
import type { AccountType } from '../../lib/types/auth';

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRoleParam = searchParams?.get('role') === 'supplier' ? 'supplier' : 'traveler';
  const requestedRedirect = searchParams?.get('redirectTo');
  const redirectTo = requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//')
    ? requestedRedirect
    : undefined;

  const [accountType, setAccountType] = useState<AccountType>(initialRoleParam);

  // Form State
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    company_name: '',
    city: '',
    state: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const passwordChecks = [
    { label: '8+ characters', passed: formData.password.length >= 8 },
    { label: '1 uppercase letter', passed: /[A-Z]/.test(formData.password) },
    { label: '1 number', passed: /[0-9]/.test(formData.password) },
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Mobile Number auto-formatting for Indian format
    if (name === 'phone') {
      const cleaned = value.replace(/[^\d+]/g, '');
      setFormData((prev) => ({ ...prev, phone: cleaned }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleAccountTypeChange = (type: AccountType) => {
    setAccountType(type);
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setToast(null);

    const isSupplier = accountType === 'supplier';
    const roleMeta = isSupplier ? 'supplier' : 'user';

    // Validate using Zod schemas
    const validationResult = isSupplier
      ? supplierSignupSchema.safeParse({ ...formData, accountType: 'supplier' })
      : travelerSignupSchema.safeParse({ ...formData, accountType: 'traveler' });

    if (!validationResult.success) {
      const formattedErrors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
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
      const origin = window.location.origin;
      const callbackParams = new URLSearchParams({ role: roleMeta });
      if (redirectTo) callbackParams.set('next', redirectTo);
      const emailRedirectTo = `${origin}/auth/callback?${callbackParams.toString()}`;

      // Build User Metadata payload
      const userMetadata: Record<string, string> = {
        role: roleMeta,
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim(),
      };

      if (isSupplier) {
        userMetadata.company_name = formData.company_name.trim();
        userMetadata.city = formData.city.trim();
        userMetadata.state = formData.state.trim();
      }

      const { data, error } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: userMetadata,
          emailRedirectTo,
        },
      });

      if (error) {
        throw error;
      }

      setToast({
        type: 'success',
        title: data.session ? 'Account created' : 'Check your inbox',
        message: data.session
          ? 'Taking you to Idea Holiday...'
          : `We sent a confirmation link to ${formData.email.trim()}.`,
      });

      // If email confirmation is disabled or session exists, redirect immediately
      if (data.session) {
        router.push(redirectTo || (isSupplier ? '/supplier/dashboard' : '/account/bookings'));
      } else {
        setConfirmationEmail(formData.email.trim());
        setIsSubmitting(false);
      }
    } catch (err: unknown) {
      setIsSubmitting(false);
      const errorMessage = err instanceof Error ? err.message : '';
      const message = errorMessage.toLowerCase().includes('already registered')
        ? 'An account with this email already exists. Try signing in instead.'
        : errorMessage || 'Failed to complete registration. Please check your information.';
      setToast({
        type: 'error',
        title: 'Sign Up Failed',
        message,
      });
    }
  };

  if (confirmationEmail) {
    const loginParams = new URLSearchParams({ email: confirmationEmail });
    if (redirectTo) loginParams.set('redirectTo', redirectTo);

    return (
      <div className="w-full max-w-lg mx-auto">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500" />
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400 mb-2">One last step</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Check your email</h1>
          <p className="text-sm text-slate-400 mt-3 leading-6">
            We sent a secure confirmation link to
            <strong className="block text-slate-200 font-semibold mt-1 break-all">{confirmationEmail}</strong>
          </p>
          <div className="mt-6 rounded-2xl bg-slate-950/70 border border-slate-800 p-4 text-left text-sm text-slate-400">
            Open the link in that email to activate your account. If it is not there in a few minutes, check your spam folder.
          </div>
          <Link
            href={`/login?${loginParams.toString()}`}
            className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm rounded-xl transition-all"
          >
            Go to sign in <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={() => setConfirmationEmail('')}
            className="mt-4 text-sm text-slate-400 hover:text-amber-300 transition-colors"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Decorative Top Accent Gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500" />

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3">
            <Compass className="w-6 h-6 animate-pulse" />
          </div>
          <h1 className="flex flex-wrap items-baseline justify-center gap-2 text-2xl font-bold text-slate-100 tracking-tight">
            <span>Join</span> <IdeaHolidayLogo className="text-[1.1em]" />
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Choose your account type to get started with India&apos;s leading travel marketplace
          </p>
        </div>

        {/* Dual Sign-up Account Type Toggle Tabs */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => handleAccountTypeChange('traveler')}
            className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-semibold transition-all ${
              accountType === 'traveler'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Traveler Account</span>
          </button>

          <button
            type="button"
            onClick={() => handleAccountTypeChange('supplier')}
            className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-semibold transition-all ${
              accountType === 'supplier'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Supplier / Fleet Partner</span>
          </button>
        </div>

        {/* Google OAuth Button */}
        <div className="mb-5">
          <GoogleAuthButton
            role={accountType === 'supplier' ? 'supplier' : 'user'}
            redirectTo={redirectTo}
            label={`Sign up as ${accountType === 'supplier' ? 'Supplier' : 'Traveler'} with Google`}
            onError={(msg) => setToast({ type: 'error', title: 'Google Signup Error', message: msg })}
          />
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center mb-5">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-xs uppercase tracking-wider text-slate-500 font-medium absolute">
            or sign up with email
          </span>
        </div>

        {/* Sign Up Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Full Name */}
          <div>
            <label htmlFor="signup-full-name" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                id="signup-full-name"
                name="full_name"
                autoComplete="name"
                required
                aria-invalid={Boolean(errors.full_name)}
                aria-describedby={errors.full_name ? 'signup-full-name-error' : undefined}
                value={formData.full_name}
                onChange={handleInputChange}
                placeholder="e.g. Rahul Sharma"
                className={`w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                  errors.full_name
                    ? 'border-rose-600 focus:ring-rose-500/50'
                    : 'border-slate-800 focus:border-amber-500 focus:ring-amber-500/30'
                }`}
              />
            </div>
            {errors.full_name && <p id="signup-full-name-error" className="mt-1 text-xs text-rose-400">{errors.full_name}</p>}
          </div>

          {/* Email Address */}
          <div>
            <label htmlFor="signup-email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                id="signup-email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'signup-email-error' : undefined}
                value={formData.email}
                onChange={handleInputChange}
                placeholder="rahul@example.com"
                className={`w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                  errors.email
                    ? 'border-rose-600 focus:ring-rose-500/50'
                    : 'border-slate-800 focus:border-amber-500 focus:ring-amber-500/30'
                }`}
              />
            </div>
            {errors.email && <p id="signup-email-error" className="mt-1 text-xs text-rose-400">{errors.email}</p>}
          </div>

          {/* Mobile Number (+91 format) */}
          <div>
            <label htmlFor="signup-phone" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Mobile Number (+91 India Format)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Phone className="w-4 h-4" />
              </div>
              <input
                type="tel"
                id="signup-phone"
                name="phone"
                autoComplete="tel"
                inputMode="tel"
                required
                maxLength={13}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? 'signup-phone-error' : undefined}
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="+91 9876543210"
                className={`w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                  errors.phone
                    ? 'border-rose-600 focus:ring-rose-500/50'
                    : 'border-slate-800 focus:border-amber-500 focus:ring-amber-500/30'
                }`}
              />
            </div>
            {errors.phone && <p id="signup-phone-error" className="mt-1 text-xs text-rose-400">{errors.phone}</p>}
          </div>

          {/* Supplier Specific Input Fields */}
          {accountType === 'supplier' && (
            <div className="space-y-4 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5" />
                <span>Supplier Agency Details</span>
              </div>

              {/* Company / Agency Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Company / Agency Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleInputChange}
                    placeholder="e.g. Royal Deccan Travels Pvt Ltd"
                    className={`w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                      errors.company_name
                        ? 'border-rose-600 focus:ring-rose-500/50'
                        : 'border-slate-800 focus:border-amber-500 focus:ring-amber-500/30'
                    }`}
                  />
                </div>
                {errors.company_name && (
                  <p className="mt-1 text-xs text-rose-400">{errors.company_name}</p>
                )}
              </div>

              {/* City and State */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    City
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="e.g. Jaipur"
                      className={`w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                        errors.city
                          ? 'border-rose-600 focus:ring-rose-500/50'
                          : 'border-slate-800 focus:border-amber-500 focus:ring-amber-500/30'
                      }`}
                    />
                  </div>
                  {errors.city && <p className="mt-1 text-xs text-rose-400">{errors.city}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    State
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      placeholder="e.g. Rajasthan"
                      className={`w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                        errors.state
                          ? 'border-rose-600 focus:ring-rose-500/50'
                          : 'border-slate-800 focus:border-amber-500 focus:ring-amber-500/30'
                      }`}
                    />
                  </div>
                  {errors.state && <p className="mt-1 text-xs text-rose-400">{errors.state}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Password Field */}
          <div>
            <label htmlFor="signup-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                id="signup-password"
                name="password"
                autoComplete="new-password"
                required
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'signup-password-error signup-password-help' : 'signup-password-help'}
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Min. 8 characters with 1 uppercase & number"
                className={`w-full pl-10 pr-12 py-2.5 bg-slate-950/80 border rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
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
            {errors.password && <p id="signup-password-error" className="mt-1 text-xs text-rose-400">{errors.password}</p>}
            <div id="signup-password-help" className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Password requirements">
              {passwordChecks.map((check) => (
                <span key={check.label} className={`inline-flex items-center gap-1 text-[11px] ${check.passed ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <CheckCircle className="w-3 h-3" aria-hidden="true" />
                  {check.label}
                </span>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.99]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>
                  Register as {accountType === 'supplier' ? 'Supplier Partner' : 'Traveler'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="mt-6 pt-5 border-t border-slate-800 text-center text-sm text-slate-400">
          Already registered?{' '}
          <Link
            href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
            className="text-amber-400 font-semibold hover:text-amber-300 hover:underline transition-colors"
          >
            Sign in to your account
          </Link>
        </div>
      </div>
    </div>
  );
}
