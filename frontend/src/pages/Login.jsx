import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Gift, Sparkles } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import GoogleAuthButton from "../components/GoogleAuthButton.jsx";

export default function Login({ initialMode = "login" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const from = params.get("from") || "/";
  const refCodeParam = (params.get("ref") || params.get("referral") || "").trim();
  
  const isExplicitSignup = initialMode === "signup" || location.pathname === "/signup" || params.get("mode") === "signup" || Boolean(refCodeParam);
  const [mode, setMode] = useState(isExplicitSignup ? "signup" : "login");
  const [referralCode, setReferralCode] = useState(() => {
    if (refCodeParam) {
      sessionStorage.setItem("ih_ref_code", refCodeParam);
      return refCodeParam;
    }
    return sessionStorage.getItem("ih_ref_code") || "";
  });
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, login } = useAuth();

  const getRedirectTarget = (authenticatedUser) => {
    if (from && from !== "/" && from !== "/login" && from !== "/signup") {
      return from;
    }
    const role = String(authenticatedUser?.role || authenticatedUser?.user_metadata?.role || "").toUpperCase();
    if (role === "SUPPLIER") return "/supplier";
    if (role === "ADMIN") return "/admin";
    if (role === "OPS" || role === "STAFF" || role === "DRIVER") return "/ops";
    return "/";
  };

  useEffect(() => {
    if (user) {
      navigate(getRedirectTarget(user), { replace: true });
    }
  }, [user, from, navigate]);

  useEffect(() => {
    const showAuthError = (event) => setError(event.detail || "Google sign-in could not be started.");
    window.addEventListener("wanderindia:auth-error", showAuthError);
    return () => window.removeEventListener("wanderindia:auth-error", showAuthError);
  }, []);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    const next = new URLSearchParams(location.search);
    if (nextMode === "signup") next.set("mode", "signup");
    else next.delete("mode");
    const basePath = nextMode === "signup" ? "/signup" : "/login";
    navigate({ pathname: basePath, search: next.toString() }, { replace: true });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        ...form,
        email: form.email.trim(),
        name: form.name.trim(),
        ...(mode === "signup" && referralCode ? { referralCode } : {}),
      };
      const fn = mode === "login" ? api.login : api.signup;
      const result = await fn(payload);
      login(result.token, result.user);
      navigate(getRedirectTarget(result.user), { replace: true });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <div className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-[1fr_460px]">
      <section className="hidden lg:block">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.22em] text-amber-700 font-bold">Your India, one account</p>
        <h1 className="max-w-xl font-display text-5xl leading-tight text-stone-900">
          Book remarkable trips. Keep every ticket close.
        </h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-stone-600">
          Save favorites, manage bookings, and get trip updates from verified local travel partners across India.
        </p>
        <div className="mt-8 flex gap-6 text-sm font-semibold text-stone-700">
          <span className="flex items-center gap-1.5"><span className="text-emerald-600 font-bold">✓</span> Secure checkout</span>
          <span className="flex items-center gap-1.5"><span className="text-emerald-600 font-bold">✓</span> Verified operators</span>
          <span className="flex items-center gap-1.5"><span className="text-emerald-600 font-bold">✓</span> Easy trip access</span>
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Idea Holiday account</p>
          <h2 className="font-display text-3xl text-stone-900">{isSignup ? "Create your account" : "Welcome back"}</h2>
          <p className="mt-2 text-sm text-stone-600">
            {isSignup ? "Join in under a minute." : "Log in to see your bookings and saved trips."}
          </p>
        </div>

        {isSignup && referralCode && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-300/80 p-3.5 text-amber-900 shadow-xs">
            <Gift className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold block">Referral Discount Activated! 🎉</span>
              <span className="text-amber-800">
                Code <strong className="font-mono font-bold bg-amber-200/70 px-1.5 py-0.5 rounded">{referralCode}</strong> applied. ₹250 welcome gift ready.
              </span>
            </div>
          </div>
        )}

        <GoogleAuthButton
          label={isSignup ? "Sign up with Google" : "Log in with Google"}
          from={from}
          className="w-full"
        />

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-stone-400">
          <span className="h-px flex-1 bg-stone-200" /><span>or use email</span><span className="h-px flex-1 bg-stone-200" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          {isSignup && (
            <div>
              <label htmlFor="auth-name" className="mb-1.5 block text-xs font-bold text-stone-700">Full name</label>
              <input id="auth-name" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Rahul Sharma" className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-xs font-bold text-stone-700">Email address</label>
            <input id="auth-email" required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com" className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
          </div>
          {isSignup && (
            <div>
              <label htmlFor="auth-phone" className="mb-1.5 block text-xs font-bold text-stone-700">Mobile number</label>
              <input id="auth-phone" required type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 43210" className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
            </div>
          )}
          <div>
            <label htmlFor="auth-password" className="mb-1.5 block text-xs font-bold text-stone-700">Password</label>
            <input id="auth-password" required minLength={6} type="password" autoComplete={isSignup ? "new-password" : "current-password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="At least 6 characters" className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
          </div>

          {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}

          <button disabled={loading} aria-busy={loading} className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-extrabold text-stone-950 transition hover:bg-amber-400 shadow-md shadow-amber-500/20 disabled:opacity-60">
            {loading ? "Please wait…" : isSignup ? "Create account with email" : "Log in with email"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-600">
          {isSignup ? "Already have an account?" : "New to Idea Holiday?"}{" "}
          <button type="button" onClick={() => switchMode(isSignup ? "login" : "signup")} className="font-bold text-amber-700 hover:text-amber-800">
            {isSignup ? "Log in" : "Sign up"}
          </button>
        </p>
        <p className="mt-4 text-center text-[11px] leading-5 text-stone-500">
          By continuing, you agree to Idea Holiday's terms and privacy policy.
        </p>
      </section>
    </div>
  );
}
