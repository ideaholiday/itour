import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Lock, Home } from "lucide-react";
import Button from "../components/ui/Button";

export function Forbidden403() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-8 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Access Restricted</span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 font-display mt-1 mb-3">
          403 — Unauthorized Area
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 mb-8">
          You don't have the required permissions to view this portal or dashboard. Please sign in with appropriate role.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/login">
            <Button variant="primary" icon={Lock} className="w-full sm:w-auto">
              Sign In
            </Button>
          </Link>
          <Link to="/">
            <Button variant="outline" icon={Home} className="w-full sm:w-auto">
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Forbidden403;
