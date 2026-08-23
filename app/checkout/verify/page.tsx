'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

function VerifyContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order_id');
  const bookingRef = searchParams.get('bookingRef');

  const [loading, setLoading] = useState(Boolean(orderId));
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(orderId ? '' : 'Order reference is missing.');

  useEffect(() => {
    if (!orderId) {
      return;
    }

    fetch('/api/checkout/cashfree/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, bookingRef }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Payment verification failed');
        setSuccess(true);
      })
      .catch((err) => {
        setError(err.message || 'We could not verify your payment with Cashfree.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [orderId, bookingRef]);

  return (
    <div className="mx-auto max-w-md w-full rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
      {loading ? (
        <div className="py-8">
          <LoaderCircle size={48} className="mx-auto animate-spin text-emerald-400" />
          <h1 className="mt-6 text-xl font-bold text-white">Verifying your payment…</h1>
          <p className="mt-2 text-sm text-slate-400">Connecting with Cashfree Payment Gateway to secure your trip.</p>
        </div>
      ) : success ? (
        <div className="py-6">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Check size={32} className="stroke-[3]" />
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <ShieldCheck size={14} /> Payment Verified
          </span>
          <h1 className="mt-3 text-2xl font-black text-white">Your booking is confirmed!</h1>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            We received your payment through Cashfree. Your supplier has been notified to dispatch your trip.
          </p>
          {bookingRef && (
            <div className="mt-6 rounded-2xl bg-slate-950 p-4 border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Booking Reference</span>
              <strong className="mt-1 block font-mono text-xl text-amber-400">{bookingRef}</strong>
            </div>
          )}
          <Link
            href="/"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-5 py-3.5 text-sm font-extrabold text-slate-950 transition hover:bg-amber-400"
          >
            Return to Idea Holiday
          </Link>
        </div>
      ) : (
        <div className="py-6">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <CircleAlert size={32} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-white">Verification incomplete</h1>
          <p className="mt-2 text-xs text-rose-300 leading-relaxed">{error}</p>
          <Link
            href="/"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-800 px-5 py-3.5 text-sm font-bold text-slate-200 hover:bg-slate-700"
          >
            Back to Home
          </Link>
        </div>
      )}
    </div>
  );
}

export default function CheckoutVerifyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 flex items-center justify-center">
      <Suspense
        fallback={
          <div className="py-8 text-center text-slate-400">
            <LoaderCircle size={36} className="mx-auto animate-spin text-emerald-400" />
            <p className="mt-3 text-sm">Loading verification…</p>
          </div>
        }
      >
        <VerifyContent />
      </Suspense>
    </main>
  );
}
