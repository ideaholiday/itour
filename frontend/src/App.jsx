import React from "react";
import { Routes, Route } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { AuthProvider } from "./lib/auth.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import Search from "./pages/Search.jsx";
import ActivityDetail from "./pages/ActivityDetail.jsx";
import BookingConfirmed from "./pages/BookingConfirmed.jsx";
import MyBookings from "./pages/MyBookings.jsx";
import Login from "./pages/Login.jsx";
import HowItWorks from "./pages/HowItWorks.jsx";
import { AboutPage, CancellationPage, ContactPage, TermsPage } from "./pages/InfoPages.jsx";

const TransferSearch = React.lazy(() => import("./pages/TransferSearch.jsx"));
const SupplierPortal = React.lazy(() => import("./pages/SupplierPortal.jsx"));
const SupplierSignup = React.lazy(() => import("./pages/SupplierSignup.jsx"));
const SupplierDashboardPage = React.lazy(() => import("./pages/SupplierDashboardPage.jsx"));
const SupplierBookingsPage = React.lazy(() => import("./pages/SupplierBookingsPage.jsx"));
const TourProductBuilder = React.lazy(() => import("./pages/TourProductBuilder.jsx"));
const SupplierListingChooser = React.lazy(() => import("./pages/SupplierListingChooser.jsx"));
const SupplierTransferBuilder = React.lazy(() => import("./pages/SupplierTransferBuilder.jsx"));
const AdminPanel = React.lazy(() => import("./pages/AdminPanel.jsx"));
const OpsPanel = React.lazy(() => import("./pages/OpsPanel.jsx"));
const Checkout = React.lazy(() => import("./pages/Checkout.jsx"));

import { analytics } from "./lib/analytics.js";

export default function App() {
  const location = useLocation();
  const isWorkspace = ["/supplier", "/admin", "/ops"].some((prefix) => location.pathname.startsWith(prefix));

  React.useEffect(() => {
    analytics.trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return (
    <AuthProvider>
      <ErrorBoundary>
        <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-stone-900 font-sans">
          {!isWorkspace && <Navbar />}
          <main className="flex-1">
            <React.Suspense fallback={<div className="grid min-h-[55vh] place-items-center bg-[#FAF9F6] text-sm font-semibold text-stone-600">Loading your Idea Holiday workspace…</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/transfers" element={<TransferSearch />} />
              <Route path="/supplier" element={<SupplierDashboardPage />} />
              <Route path="/supplier/signup" element={<SupplierSignup />} />
              <Route path="/supplier/dashboard" element={<SupplierDashboardPage />} />
              <Route path="/supplier/bookings" element={<SupplierBookingsPage />} />
              <Route path="/supplier/portal" element={<SupplierPortal />} />
              <Route path="/supplier/coverage" element={<SupplierDashboardPage />} />
              <Route path="/supplier/products/create" element={<SupplierListingChooser />} />
              <Route path="/supplier/transfers/create" element={<SupplierTransferBuilder />} />
              <Route path="/supplier/tours/create" element={<TourProductBuilder />} />
              <Route path="/admin" element={<AdminPanel view="overview" />} />
              <Route path="/admin/suppliers" element={<AdminPanel view="suppliers" />} />
              <Route path="/admin/products" element={<AdminPanel view="products" />} />
              <Route path="/admin/finance" element={<AdminPanel view="finance" />} />
              <Route path="/admin/quality" element={<AdminPanel view="quality" />} />
              <Route path="/ops" element={<OpsPanel view="live" />} />
              <Route path="/ops/live" element={<OpsPanel view="live" />} />
              <Route path="/ops/notifications" element={<OpsPanel view="notifications" />} />
              <Route path="/ops/support" element={<OpsPanel view="support" />} />
              <Route path="/ops/tasks" element={<OpsPanel view="tasks" />} />
              <Route path="/activity/:id" element={<ActivityDetail />} />
              <Route path="/checkout/:id" element={<Checkout />} />
              <Route path="/booking-confirmed/:ref" element={<BookingConfirmed />} />
              <Route path="/bookings" element={<MyBookings />} />
              <Route path="/login" element={<Login />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/cancellation" element={<CancellationPage />} />
              <Route path="/about-us" element={<AboutPage />} />
              <Route path="/contact-us" element={<ContactPage />} />
            </Routes>
            </React.Suspense>
          </main>
          {!isWorkspace && <Footer />}
        </div>
      </ErrorBoundary>
    </AuthProvider>
  );
}
