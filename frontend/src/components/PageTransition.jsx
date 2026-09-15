import React, { useEffect, useRef } from "react";

/**
 * PageTransition — wraps page content with a CSS fade+slide-up entry animation.
 * Uses IntersectionObserver-free CSS animation triggered on mount.
 */
export default function PageTransition({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Force reflow then add class so animation fires
    el.classList.remove("page-enter");
    void el.offsetWidth;
    el.classList.add("page-enter");
  }, []);

  return (
    <div ref={ref} className="page-enter">
      {children}
    </div>
  );
}
