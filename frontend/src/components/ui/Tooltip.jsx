import React, { useState } from "react";

export function Tooltip({ children, content, position = "top", className = "" }) {
  const [isVisible, setIsVisible] = useState(false);

  if (!content) return children;

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={`absolute ${positions[position] || positions.top} z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-stone-900 dark:bg-stone-800 rounded-xl shadow-lg whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95 duration-150`}
        >
          {content}
        </div>
      )}
    </div>
  );
}

export default Tooltip;
