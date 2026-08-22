import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  Check,
  Eye,
  EyeOff,
  Headphones,
  MapPin,
  ShieldCheck,
  Store,
  UsersRound,
} from "lucide-react";
import IdeaHolidayLogo from "../components/IdeaHolidayLogo.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const initialForm = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  cityId: "",
  city: "",
  state: "",
  password: "",
  confirmPassword: "",
  agreed: false,
};

const benefits = [
  [BarChart3, "Reach more travelers", "Sell tours and transfers to guests planning trips across India."],
  [ShieldCheck, "Secure partner tools", "Manage bookings, pricing, fleet readiness and payouts from one workspace."],
  [Headphones, "Local support", "Get onboarding and operations support when you need a hand."],
];

function Field({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

export default function SupplierSignup() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [cities, setCities] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const role = String(user?.role || user?.user_metadata?.role || "").toUpperCase();
    if (role === "SUPPLIER" && (user?.supplier_id || user?.user_metadata?.supplier_id)) {
      navigate("/supplier/dashboard", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    api.getCities()
      .then((data) => setCities(Array.isArray(data) ? data : []))
      .catch(() => setError("We could not load the approved city list. Please refresh and try again."))
      .finally(() => setCitiesLoading(false));
  }, []);

  const update = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError("");
  };

  const selectCity = (event) => {
    const selected = cities.find((city) => city.id === event.target.value);
    setForm((current) => ({
      ...current,
      cityId: selected?.id || "",
      city: selected?.name || "",
      state: selected?.state || "",
    }));
    if (error) setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (form.password.length < 8) {
      setError("Create a password with at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!form.agreed) {
      setError("Please accept the partner terms to continue.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.supplierSignup({
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        password: form.password,
      });
      login(result.token, result.user);
      navigate("/supplier/dashboard?welcome=1", { replace: true });
    } catch (err) {
      setError(err.message || "We could not create your partner account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10";

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Idea Holiday home"><IdeaHolidayLogo className="text-[1.55rem]" dark={false} /></Link>
          <p className="text-sm text-stone-600">Already a partner? <Link to="/login?from=%2Fsupplier%2Fdashboard" className="font-extrabold text-amber-800 hover:text-amber-900">Log in</Link></p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(500px,0.9fr)] lg:px-8 lg:py-16">
        <section className="flex flex-col justify-center lg:pr-10">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.14em] text-amber-800">
            <Store className="h-3.5 w-3.5" /> Idea Holiday Partners
          </div>
          <h1 className="mt-6 max-w-2xl font-display text-4xl font-semibold leading-[1.08] text-stone-900 sm:text-5xl lg:text-[3.6rem]">
            Turn your local expertise into unforgettable trips.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-stone-600">
            Join India’s growing network of tour operators and mobility partners. Publish experiences, manage every booking, and grow from a single partner workspace.
          </p>

          <div className="mt-9 space-y-5">
            {benefits.map(([Icon, title, copy]) => (
              <div key={title} className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800"><Icon className="h-5 w-5" /></span>
                <div><h2 className="text-sm font-extrabold text-stone-900">{title}</h2><p className="mt-1 max-w-md text-sm leading-6 text-stone-600">{copy}</p></div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-stone-200 pt-6 text-xs font-bold text-stone-500">
            <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-emerald-600" /> Verified marketplace</span>
            <span className="inline-flex items-center gap-1.5"><UsersRound className="h-4 w-4 text-emerald-600" /> Built for Indian operators</span>
          </div>
        </section>

        <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xl sm:p-8">
          <div className="mb-7">
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-amber-800">Partner application</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-stone-900">Create your supplier account</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">Start with your business details. You can complete KYB verification from your dashboard.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field id="supplier-company" label="Business or company name">
              <div className="relative"><Building2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input id="supplier-company" required autoComplete="organization" value={form.companyName} onChange={update("companyName")} placeholder="e.g. Coastal Trails Goa" className={`${inputClass} pl-10`} /></div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="supplier-name" label="Contact person"><input id="supplier-name" required autoComplete="name" value={form.contactName} onChange={update("contactName")} placeholder="Full name" className={inputClass} /></Field>
              <Field id="supplier-phone" label="Mobile number"><input id="supplier-phone" required type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={update("phone")} placeholder="+91 98765 43210" className={inputClass} /></Field>
            </div>

            <Field id="supplier-email" label="Work email address"><input id="supplier-email" required type="email" autoComplete="email" value={form.email} onChange={update("email")} placeholder="you@company.com" className={inputClass} /></Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="supplier-city" label="Base city">
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <select id="supplier-city" required disabled={citiesLoading} value={form.cityId} onChange={selectCity} className={`${inputClass} appearance-none pl-10 disabled:bg-stone-100`}>
                    <option value="">{citiesLoading ? "Loading approved cities…" : "Select a city"}</option>
                    <optgroup label="India metro cities">
                      {cities.filter((city) => city.category === "METRO").map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                    </optgroup>
                    <optgroup label="Tourism cities">
                      {cities.filter((city) => city.category !== "METRO").map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                    </optgroup>
                  </select>
                </div>
              </Field>
              <Field id="supplier-state" label="State"><input id="supplier-state" readOnly tabIndex={-1} value={form.state} placeholder="Selected automatically" className={`${inputClass} bg-[#FAF9F6] text-stone-600`} /></Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="supplier-password" label="Create password"><div className="relative"><input id="supplier-password" required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={update("password")} placeholder="8+ characters" className={`${inputClass} pr-10`} /><button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-stone-400 hover:text-stone-700">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></Field>
              <Field id="supplier-password-confirm" label="Confirm password"><input id="supplier-password-confirm" required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.confirmPassword} onChange={update("confirmPassword")} placeholder="Repeat password" className={inputClass} /></Field>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#FAF9F6] border border-stone-200 p-3 text-xs leading-5 text-stone-600">
              <input required type="checkbox" checked={form.agreed} onChange={update("agreed")} className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-amber-500" />
              <span>I agree to the <Link to="/terms" className="font-bold text-stone-900 underline decoration-stone-300 underline-offset-2">partner terms</Link> and confirm I’m authorized to represent this business.</span>
            </label>

            {error && <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-3.5 py-3 text-sm font-semibold text-rose-800">{error}</p>}

            <button disabled={loading} aria-busy={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-400 px-5 py-3.5 text-sm font-bold text-stone-950 shadow-sm transition disabled:cursor-wait disabled:opacity-60">
              {loading ? "Creating your partner account…" : <>Create partner account <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-stone-500"><Check className="h-3.5 w-3.5 text-emerald-600" /> No setup fee · Review usually starts within 1 business day</div>
        </section>
      </main>
    </div>
  );
}
