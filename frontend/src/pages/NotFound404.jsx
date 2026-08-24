import React from "react";
import { Link } from "react-router-dom";
import { Compass, ArrowLeft, Search } from "lucide-react";
import Button from "../components/ui/Button";

export function NotFound404() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-8 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <Compass className="w-8 h-8 animate-spin" style={{ animationDuration: "12s" }} />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Error 404</span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 font-display mt-1 mb-3">
          This Page Has Wandered Off
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 mb-8">
          The experience or destination you're looking for doesn't exist or has moved to a new route.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/">
            <Button variant="primary" icon={ArrowLeft} className="w-full sm:w-auto">
              Back to Home
            </Button>
          </Link>
          <Link to="/search">
            <Button variant="outline" icon={Search} className="w-full sm:w-auto">
              Explore Experiences
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NotFound404;
