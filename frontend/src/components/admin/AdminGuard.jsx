import React from "react";
import { useAuth } from "../../lib/auth.jsx";
import { ShieldAlert, Lock } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminGuard({ children }) {
  const { user, isAdmin } = useAuth();

  const currentRole = user?.user_metadata?.role || user?.role || "guest";

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white border border-stone-200 rounded-3xl p-8 shadow-xl space-y-6 text-center">
        <div className="w-16 h-16 bg-rose-50 border border-rose-300 rounded-2xl flex items-center justify-center mx-auto text-rose-600">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-display font-bold text-stone-900">
            Access Denied — Admin Authorization Required
          </h2>
          <p className="text-sm text-stone-500">
            Sign in with an authorized Idea Holiday administrator account to continue.
          </p>
        </div>

        <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-4 text-left space-y-2 text-xs font-mono">
          <div className="flex justify-between items-center text-stone-500">
            <span>Logged User:</span>
            <span className="text-stone-900 font-semibold">{user?.email || "Unauthenticated"}</span>
          </div>
          <div className="flex justify-between items-center text-stone-500">
            <span>Detected Role:</span>
            <span className="text-rose-600 font-bold uppercase">{currentRole}</span>
          </div>
          <div className="flex justify-between items-center text-stone-500"><span>Required access:</span><span className="text-emerald-800 font-bold">Administrator</span></div>
        </div>

        <div className="pt-2 space-y-3">
          <Link
            to="/login"
            className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm block shadow-sm"
          >
            <Lock className="w-4 h-4" />
            Sign in securely
          </Link>
        </div>
      </div>
    </div>
  );
}
