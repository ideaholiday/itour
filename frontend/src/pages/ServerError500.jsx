import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Button from "../components/ui/Button";

export function ServerError500() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-8 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">Error 500</span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 font-display mt-1 mb-3">
          Something Went Wrong
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 mb-8">
          Our servers encountered an unexpected issue while preparing your itinerary. Please try again.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="primary" icon={RotateCcw} onClick={() => window.location.reload()} className="w-full sm:w-auto">
            Reload Page
          </Button>
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

export default ServerError500;
