import React, { Suspense } from 'react';
import { LoginForm } from '../../components/auth/LoginForm';
import { Loader2 } from 'lucide-react';

export const metadata = {
  title: 'Sign In | Idea Holiday — Travel Marketplace',
  description: 'Log in to your Idea Holiday account to manage tour bookings, transfers, and fleet operations.',
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.15),rgba(255,255,255,0))] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
            <p className="text-sm">Loading Idea Holiday Auth Portal...</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
