/**
 * Domain context helper for multi-domain routing:
 * - ideaholiday.in (Traveler Consumer Marketplace)
 * - supply.ideaholiday.in (Supplier Extranet & ResTech Reservation System)
 * - admin.ideaholiday.in (Admin Operations Control Plane)
 */

export function getDomainInfo() {
  if (typeof window === "undefined") {
    return {
      portal: "traveler",
      isSupplier: false,
      isAdmin: false,
      isTraveler: true,
      hostname: "ideaholiday.in",
    };
  }

  const hostname = window.location.hostname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const portalParam = (searchParams.get("portal") || "").toLowerCase();
  const pathname = window.location.pathname.toLowerCase();

  // 1. Explicit query override (useful for dev testing on single port)
  if (portalParam === "supplier") {
    return { portal: "supplier", isSupplier: true, isAdmin: false, isTraveler: false, hostname };
  }
  if (portalParam === "admin") {
    return { portal: "admin", isSupplier: false, isAdmin: true, isTraveler: false, hostname };
  }
  if (portalParam === "traveler") {
    return { portal: "traveler", isSupplier: false, isAdmin: false, isTraveler: true, hostname };
  }

  // 2. Hostname-based detection
  if (hostname === "supply.ideaholiday.in" || hostname.startsWith("supply.")) {
    return { portal: "supplier", isSupplier: true, isAdmin: false, isTraveler: false, hostname };
  }
  if (hostname === "admin.ideaholiday.in" || hostname.startsWith("admin.")) {
    return { portal: "admin", isSupplier: false, isAdmin: true, isTraveler: false, hostname };
  }

  // 3. Pathname detection for default domain
  const isSupplierPath = pathname.startsWith("/supplier");
  const isAdminPath = pathname.startsWith("/admin") || pathname.startsWith("/ops");

  return {
    portal: isSupplierPath ? "supplier" : isAdminPath ? "admin" : "traveler",
    isSupplier: isSupplierPath,
    isAdmin: isAdminPath,
    isTraveler: !isSupplierPath && !isAdminPath,
    hostname,
  };
}

export function getPortalUrls() {
  const isDev = typeof window !== "undefined" && (window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1"));
  const port = typeof window !== "undefined" ? window.location.port : "5173";
  const portStr = port ? `:${port}` : "";

  if (isDev) {
    return {
      traveler: `http://localhost${portStr}/?portal=traveler`,
      supplier: `http://localhost${portStr}/?portal=supplier`,
      admin: `http://localhost${portStr}/?portal=admin`,
    };
  }

  return {
    traveler: "https://ideaholiday.in",
    supplier: "https://supply.ideaholiday.in",
    admin: "https://admin.ideaholiday.in",
  };
}
