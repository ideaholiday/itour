import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, Calendar, ArrowRight, Zap, RefreshCw, Key, Building2 } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

export default function SupplierLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await api.login({
        email: email.trim(),
        password,
        portal: "supplier",
      });

      login(result.token, result.user);
      navigate("/supplier/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Supplier login failed. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 mb-4 shadow-inner">
          <Building2 className="w-7 h-7" />
        </div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-amber-500 font-semibold mb-1">
          supply.ideaholiday.in
        </div>
        <h2 className="text-3xl font-display font-bold tracking-tight text-white">
          Supplier Reservation System
        </h2>
        <p className="mt-2 text-sm text-stone-400">
          Manage listings, real-time seat inventory, and ResTech channels.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-stone-950/80 border border-stone-800 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {error && (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200 flex items-start gap-3">
              <span className="text-red-400 font-bold">!</span>
              <div>{error}</div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-300">
                Work Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="supplier@yourcompany.com"
                className="mt-1 block w-full rounded-xl border border-stone-700 bg-stone-900/90 px-3.5 py-2.5 text-sm text-white placeholder-stone-500 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-300">
                  Password
                </label>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full rounded-xl border border-stone-700 bg-stone-900/90 px-3.5 py-2.5 text-sm text-white placeholder-stone-500 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 text-sm font-semibold text-stone-950 shadow-lg hover:from-amber-400 hover:to-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Sign in to Supplier Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-stone-800/80 text-center">
            <p className="text-xs text-stone-400">
              New tour or fleet operator?{" "}
              <Link
                to="/supplier/signup"
                className="font-semibold text-amber-400 hover:text-amber-300 transition-colors"
              >
                Register as a Supplier
              </Link>
            </p>
            <div className="mt-3">
              <a
                href="https://ideaholiday.in"
                className="text-xs text-stone-500 hover:text-stone-400 transition-colors"
              >
                ← Back to Traveler Marketplace (ideaholiday.in)
              </a>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl border border-stone-800 bg-stone-900/40">
            <Zap className="w-4 h-4 mx-auto text-amber-400 mb-1" />
            <div className="text-[11px] font-semibold text-stone-300">OCTo API</div>
            <div className="text-[10px] text-stone-500">Live Seat Engine</div>
          </div>
          <div className="p-3 rounded-xl border border-stone-800 bg-stone-900/40">
            <RefreshCw className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
            <div className="text-[11px] font-semibold text-stone-300">ResTech Sync</div>
            <div className="text-[10px] text-stone-500">Bókun & FareHarbor</div>
          </div>
          <div className="p-3 rounded-xl border border-stone-800 bg-stone-900/40">
            <ShieldCheck className="w-4 h-4 mx-auto text-sky-400 mb-1" />
            <div className="text-[11px] font-semibold text-stone-300">Fast KYB</div>
            <div className="text-[10px] text-stone-500">Instant GSTIN / PAN</div>
          </div>
        </div>
      </div>
    </div>
  );
}
