import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";

function normalizedRoute(pathname) {
  return String(pathname || "/").split("/").map((segment) => {
    if (/^\d+$/.test(segment)) return ":id";
    if (/^(activity|booking|product|supplier|user)[_-]/i.test(segment)) return ":id";
    return segment.slice(0, 60);
  }).join("/").slice(0, 160) || "/";
}

export function sendWebVital(metric, app = "vite") {
  const payload = {
    app,
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    route: normalizedRoute(window.location.pathname),
    navigationType: metric.navigationType,
  };

  fetch("/api/telemetry/web-vitals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Telemetry must never interfere with the traveler experience.
  });
}

export function startWebVitals() {
  const report = (metric) => sendWebVital(metric, "vite");
  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}

