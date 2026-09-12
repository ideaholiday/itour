import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, ArrowRight, RefreshCw, Lock } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

export default function AdminLoginPage() {
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
        portal: "admin",
      });

      login(result.token, result.user);
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err.message || "Administrator authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 mb-4 shadow-inner">
          <Shield className="w-7 h-7" />
        </div>
        <div className="text-xs font-mono uppercase tracking-[0.25em] text-rose-400 font-semibold mb-1">
          admin.ideaholiday.in
        </div>
        <h2 className="text-3xl font-display font-bold tracking-tight text-white">
          Platform Administration
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Restricted access for Idea Holiday marketplace operators.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {error && (
            <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-200 flex items-start gap-3">
              <Lock className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Admin Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ideaholiday.in"
                className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:from-rose-500 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/50 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Authenticate Session</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800 text-center">
            <a
              href="https://ideaholiday.in"
              className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
            >
              ← Return to Main Marketplace
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
