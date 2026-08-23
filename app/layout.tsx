import React from 'react';
import './globals.css';
import WebVitals from '@/components/analytics/WebVitals';

export const metadata = {
  title: 'Idea Holiday — Experiences & Transfer Marketplace',
  description: 'India\'s leading marketplace for airport transfers, sightseeing tours, and multi-day holiday packages.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased font-sans selection:bg-amber-500 selection:text-slate-950 min-h-screen">
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
