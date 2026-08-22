'use client';

import {
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  IndianRupee,
  LoaderCircle,
  LockKeyhole,
  PlaneLanding,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRound,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import LocationMapPicker, { PinLocation } from './LocationMapPicker';

type FormErrors = Partial<Record<'name' | 'phone' | 'email' | 'pickup' | 'drop' | 'flightNumber' | 'arrivalTime', string>>;

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const inputClass = 'mt-1.5 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10';

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold text-slate-300">
      {label}
      {children}
      {error && <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-400"><CircleAlert size={12} /> {error}</span>}
    </label>
  );
}

export default function CheckoutClient({ productId }: { productId: string }) {
  const params = useSearchParams();
  const isAirportTransfer = params.get('type') === 'transfers'
    || params.get('productType') === 'TRANSFER'
    || productId.toLowerCase().includes('transfer');
  const baseFare = Number(params.get('amount')) || 2400;
  const productTitle = params.get('title') || (isAirportTransfer ? 'Private Airport Transfer' : 'Private Idea Holiday Experience');
  const supplierId = params.get('supplierId') || 'sup_lucknow_cabs';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pickup, setPickup] = useState<PinLocation>({
    address: params.get('pickup') || 'Chaudhary Charan Singh International Airport, Lucknow',
    instructions: '',
    lat: Number(params.get('pickupLat')) || 26.7606,
    lng: Number(params.get('pickupLng')) || 80.8893,
    confirmed: Boolean(params.get('pickupLat') && params.get('pickupLng')),
  });
  const [drop, setDrop] = useState<PinLocation>({
    address: params.get('dropoff') || 'Hazratganj, Lucknow',
    instructions: '',
    lat: Number(params.get('dropLat')) || 26.8467,
    lng: Number(params.get('dropLng')) || 80.9462,
    confirmed: Boolean(params.get('dropLat') && params.get('dropLng')),
  });
  const [flightNumber, setFlightNumber] = useState('');
  const [arrivalTime, setArrivalTime] = useState(params.get('time') || '10:00');
  const [terminalGate, setTerminalGate] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState(params.get('promo') || '');
  const [promoMessage, setPromoMessage] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [dispatchRef, setDispatchRef] = useState('');

  const fare = useMemo(() => {
    const gst = Math.round(baseFare * 0.05);
    const fastagAndAllowance = baseFare >= 2000 ? 260 : 0;
    const discount = promoCode.toUpperCase() === 'IDEA10' ? Math.round(baseFare * 0.1) : 0;
    return { gst, fastagAndAllowance, discount, total: baseFare + gst + fastagAndAllowance - discount };
  }, [baseFare, promoCode]);

  const applyPromo = () => {
    if (promoInput.trim().toUpperCase() === 'IDEA10') {
      setPromoCode('IDEA10');
      setPromoMessage('IDEA10 applied — you saved 10% on the base fare.');
    } else {
      setPromoMessage('That code is not valid for this trip. Try IDEA10.');
    }
  };

  const validate = () => {
    const next: FormErrors = {};
    if (name.trim().length < 2) next.name = 'Enter the lead traveller’s full name.';
    if (!/^\+?[0-9\s-]{10,15}$/.test(phone.trim())) next.phone = 'Enter a valid 10–15 digit mobile number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!pickup.confirmed || pickup.address.trim().length < 4 || !Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) next.pickup = 'Select the pickup from Mappls or confirm it on the map.';
    if (!drop.confirmed || drop.address.trim().length < 4 || !Number.isFinite(drop.lat) || !Number.isFinite(drop.lng)) next.drop = 'Select the drop-off from Mappls or confirm it on the map.';
    if (isAirportTransfer && !/^[A-Z0-9]{2,3}[- ]?[0-9]{1,4}[A-Z]?$/.test(flightNumber.trim().toUpperCase())) next.flightNumber = 'Use a flight number such as 6E-204.';
    if (isAirportTransfer && !arrivalTime) next.arrivalTime = 'Select the scheduled flight arrival time.';
    setErrors(next);
    if (Object.keys(next).length) document.getElementById('checkout-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return Object.keys(next).length === 0;
  };

  const loadCashfreeSdk = () => {
    return new Promise<any>((resolve, reject) => {
      if (typeof window !== 'undefined' && (window as any).Cashfree) {
        resolve((window as any).Cashfree);
        return;
      }
      const existing = document.getElementById('cashfree-js-sdk');
      if (existing) {
        existing.addEventListener('load', () => resolve((window as any).Cashfree));
        existing.addEventListener('error', () => reject(new Error('Cashfree SDK failed to load')));
        return;
      }
      const script = document.createElement('script');
      script.id = 'cashfree-js-sdk';
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
      script.async = true;
      script.onload = () => resolve((window as any).Cashfree);
      script.onerror = () => reject(new Error('Failed to load Cashfree payment gateway SDK'));
      document.body.appendChild(script);
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setDispatchRef('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/checkout/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          supplierId,
          productType: isAirportTransfer ? 'TRANSFER' : 'DAY_TOUR',
          activityDate: params.get('date') || new Date().toISOString().slice(0, 10),
          traveler: { name: name.trim(), phone: phone.trim(), email: email.trim() },
          pickup,
          drop,
          flight: isAirportTransfer ? {
            number: flightNumber.trim().toUpperCase(),
            scheduledArrival: arrivalTime,
            terminalGate: terminalGate.trim(),
          } : null,
          fare: { baseFare, ...fare, promoCode: promoCode || null },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save dispatch details.');
      const bookingRef = result.bookingRef || result.dispatchRef || 'READY';
      const bookingId = result.bookingId;
      setDispatchRef(bookingRef);

      // Trigger Cashfree Payment Checkout
      const cfOrderResponse = await fetch('/api/checkout/cashfree/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          bookingRef,
          returnUrl: `${window.location.origin}/checkout/verify?order_id={order_id}&bookingRef=${encodeURIComponent(bookingRef)}`,
        }),
      });

      const cfOrder = await cfOrderResponse.json();
      if (!cfOrderResponse.ok) {
        throw new Error(cfOrder.error || 'Failed to initialize Cashfree payment order.');
      }

      const CashfreeSDK = await loadCashfreeSdk();
      const cashfree = CashfreeSDK({ mode: 'sandbox' });

      const checkoutResult = await cashfree.checkout({
        paymentSessionId: cfOrder.paymentSessionId,
        redirectTarget: '_modal',
      });

      if (checkoutResult?.error) {
        throw new Error(checkoutResult.error.message || 'Cashfree payment was cancelled or failed.');
      }

      // Verify payment with backend
      await fetch('/api/checkout/cashfree/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: cfOrder.orderId,
          bookingId,
          bookingRef,
        }),
      });
    } catch (error) {
      setErrors((current) => ({ ...current, pickup: (error as Error).message }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Secure checkout · Location details</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Confirm your trip details</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">Pin the exact meeting points so your driver arrives at the right entrance—not just the right postcode.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300"><LockKeyhole size={15} /> Your details are securely shared with the assigned supplier</div>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <form id="checkout-form" onSubmit={submit} noValidate className="space-y-6">
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white"><UserRound size={20} className="text-amber-400" /> Lead traveller</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" error={errors.name}>
                  <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Amit Kumar" autoComplete="name" />
                </Field>
                <Field label="WhatsApp/mobile number" error={errors.phone}>
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} placeholder="+91 98765 43210" inputMode="tel" autoComplete="tel" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Email for booking voucher" error={errors.email}>
                    <input value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="you@example.com" type="email" autoComplete="email" />
                  </Field>
                </div>
              </div>
            </section>

            <div>
              <LocationMapPicker pickup={pickup} drop={drop} onPickupChange={setPickup} onDropChange={setDrop} />
              {(errors.pickup || errors.drop) && <p role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"><CircleAlert size={16} /> {errors.pickup || errors.drop}</p>}
            </div>

            {isAirportTransfer && (
              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-6">
                <h2 className="flex items-center gap-2 text-lg font-bold text-white"><PlaneLanding size={21} className="text-amber-400" /> Flight arrival details</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <Field label="Flight number" error={errors.flightNumber}>
                    <input value={flightNumber} onChange={(event) => setFlightNumber(event.target.value.toUpperCase())} className={inputClass} placeholder="6E-204" autoCapitalize="characters" />
                  </Field>
                  <Field label="Scheduled arrival" error={errors.arrivalTime}>
                    <input value={arrivalTime} onChange={(event) => setArrivalTime(event.target.value)} className={`${inputClass} [color-scheme:dark]`} type="time" />
                  </Field>
                  <Field label="Terminal / gate (optional)">
                    <input value={terminalGate} onChange={(event) => setTerminalGate(event.target.value)} className={inputClass} placeholder="T3, Gate 2" />
                  </Field>
                </div>
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100">
                  <Clock3 size={19} className="mt-0.5 shrink-0 text-sky-300" />
                  <span><strong className="block text-white">60 minutes complimentary waiting</strong>Your driver will wait 60 minutes free after scheduled flight landing.</span>
                </div>
              </section>
            )}

            {dispatchRef && (
              <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                <BadgeCheck size={21} className="shrink-0 text-emerald-300" />
                <span><strong className="block text-white">Trip details validated and sent to dispatch</strong>Reference {dispatchRef}. You can now continue to the secure payment step.</span>
              </div>
            )}

            <button disabled={submitting} type="submit" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-70 lg:hidden">
              {submitting ? <LoaderCircle size={19} className="animate-spin" /> : <CreditCard size={19} />}
              {submitting ? 'Saving trip details…' : 'Validate & continue to payment'}
            </button>
          </form>

          <aside className="lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
              <div className="border-b border-slate-800 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">Your booking</p>
                <h2 className="mt-2 text-lg font-extrabold text-white">{productTitle}</h2>
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-400"><CalendarClock size={14} /> {params.get('date') || 'Date selected at search'} · {params.get('adults') || 2} traveller(s)</p>
              </div>

              <div className="space-y-4 p-5">
                <div className="flex justify-between text-sm"><span className="text-slate-400">Base fare</span><span className="font-bold text-white">{money.format(baseFare)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">GST (5%)</span><span className="font-bold text-white">{money.format(fare.gst)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Taxes & tolls</span><span className="font-bold text-white">{money.format(fare.fastagAndAllowance)}</span></div>
                <p className="-mt-2 flex items-center gap-1.5 text-xs text-emerald-300"><Check size={13} /> Includes Fastag tolls & driver allowance</p>
                {fare.discount > 0 && <div className="flex justify-between text-sm text-emerald-300"><span className="flex items-center gap-1.5"><Tag size={14} /> {promoCode}</span><span className="font-bold">−{money.format(fare.discount)}</span></div>}
                <div className="border-t border-dashed border-slate-700 pt-4">
                  <div className="flex items-end justify-between"><span className="font-bold text-white">Total payable</span><span className="text-2xl font-black text-amber-400">{money.format(fare.total)}</span></div>
                  <p className="mt-1 text-right text-[10px] text-slate-500">No hidden charges at pickup</p>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
                  <div className="flex gap-2">
                    <input aria-label="Promo code" value={promoInput} onChange={(event) => setPromoInput(event.target.value.toUpperCase())} placeholder="Promo code" className="min-w-0 flex-1 bg-transparent px-1 text-sm font-bold uppercase text-white outline-none placeholder:font-normal placeholder:normal-case placeholder:text-slate-600" />
                    <button type="button" onClick={applyPromo} className="min-h-10 rounded-xl bg-white px-3 text-xs font-extrabold text-slate-950 hover:bg-slate-100">Apply</button>
                  </div>
                  {promoMessage && <p className={`mt-2 text-xs ${promoCode ? 'text-emerald-300' : 'text-rose-300'}`}>{promoMessage}</p>}
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <ShieldCheck size={22} className="shrink-0 text-emerald-300" />
                  <div><p className="text-sm font-extrabold text-white">Free cancellation</p><p className="mt-0.5 text-xs leading-relaxed text-emerald-100/80">Up to 24 hours before pickup for a full refund.</p></div>
                </div>

                <button form="checkout-form" disabled={submitting} type="submit" className="hidden min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-70 lg:flex">
                  {submitting ? <LoaderCircle size={18} className="animate-spin" /> : <CreditCard size={18} />}
                  {submitting ? 'Saving details…' : 'Continue to payment'}
                  {!submitting && <ChevronRight size={18} />}
                </button>
                <p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500"><LockKeyhole size={11} /> Secure payment · UPI, cards & net banking</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-slate-400">
              <span className="rounded-xl border border-slate-800 bg-slate-900 p-3"><ShieldCheck size={17} className="mx-auto mb-1 text-amber-400" />Verified partner</span>
              <span className="rounded-xl border border-slate-800 bg-slate-900 p-3"><Sparkles size={17} className="mx-auto mb-1 text-amber-400" />Instant confirm</span>
              <span className="rounded-xl border border-slate-800 bg-slate-900 p-3"><IndianRupee size={17} className="mx-auto mb-1 text-amber-400" />Best price</span>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
