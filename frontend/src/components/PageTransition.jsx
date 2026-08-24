import React from "react";

export function PageTransition({ children, className = "" }) {
  return (
    <div className={`animate-in fade-in duration-200 ${className}`}>
      {children}
    </div>
  );
}

export default PageTransition;
