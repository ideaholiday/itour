import React, { Suspense } from 'react';
import { SignupForm } from '../../components/auth/SignupForm';
import { Loader2 } from 'lucide-react';

export const metadata = {
  title: 'Create Account | Idea Holiday — Travel Marketplace',
  description: 'Join Idea Holiday as a Traveler or Fleet Supplier Partner to book or list tours and transfers across India.',
};

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.15),rgba(255,255,255,0))] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 py-12">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
            <p className="text-sm">Loading Idea Holiday Registration Portal...</p>
          </div>
        }
      >
        <SignupForm />
      </Suspense>
    </main>
  );
}
