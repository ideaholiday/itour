import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

export function Breadcrumb({ items = [], className = "" }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 ${className}`}>
      <Link
        to="/"
        className="flex items-center gap-1 hover:text-stone-900 dark:hover:text-stone-200 transition-colors"
      >
        <Home className="w-3.5 h-3.5" />
        <span>Home</span>
      </Link>

      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
            {isLast || !item.to ? (
              <span className="font-semibold text-stone-800 dark:text-stone-200 truncate max-w-[180px]">
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to}
                className="hover:text-stone-900 dark:hover:text-stone-200 transition-colors truncate max-w-[140px]"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
