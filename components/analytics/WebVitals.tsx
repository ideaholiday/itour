'use client';

import { useReportWebVitals } from 'next/web-vitals';

function normalizeRoute(pathname: string) {
  return pathname.split('/').map((segment) => {
    if (/^\d+$/.test(segment)) return ':id';
    if (/^(activity|booking|product|supplier|user)[_-]/i.test(segment)) return ':id';
    return segment.slice(0, 60);
  }).join('/').slice(0, 160) || '/';
}

function reportMetric(metric: {
  name: string;
  value: number;
  rating?: string;
  navigationType?: string;
}) {
  const supportedNames = new Set(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']);
  if (!supportedNames.has(metric.name)) return;
  fetch('/api/telemetry/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app: 'next',
      name: metric.name,
      value: metric.value,
      rating: metric.rating || 'needs-improvement',
      route: normalizeRoute(window.location.pathname),
      navigationType: metric.navigationType,
    }),
    keepalive: true,
  }).catch(() => {
    // Performance reporting must never interrupt the application.
  });
}

export default function WebVitals() {
  useReportWebVitals(reportMetric);
  return null;
}

