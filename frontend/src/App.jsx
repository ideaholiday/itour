import React from "react";
import { Routes, Route } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import MobileBottomNav from "./components/MobileBottomNav.jsx";
import { ToastProvider } from "./components/ui/ToastProvider.jsx";
import { CurrencyProvider } from "./lib/currency.jsx";
import { analytics } from "./lib/analytics.js";

const Home = React.lazy(() => import("./pages/Home.jsx"));
const Search = React.lazy(() => import("./pages/Search.jsx"));
const TransferSearch = React.lazy(() => import("./pages/TransferSearch.jsx"));
const ActivityDetail = React.lazy(() => import("./pages/ActivityDetail.jsx"));
const Checkout = React.lazy(() => import("./pages/Checkout.jsx"));
const BookingConfirmed = React.lazy(() => import("./pages/BookingConfirmed.jsx"));
const MyBookings = React.lazy(() => import("./pages/MyBookings.jsx"));
const MyReviews = React.lazy(() => import("./pages/MyReviews.jsx"));
const Login = React.lazy(() => import("./pages/Login.jsx"));
const HowItWorks = React.lazy(() => import("./pages/HowItWorks.jsx"));
const TermsPage = React.lazy(() => import("./pages/TermsPage.jsx"));
const CancellationPage = React.lazy(() => import("./pages/CancellationPage.jsx"));
const AboutPage = React.lazy(() => import("./pages/AboutPage.jsx"));
const ContactPage = React.lazy(() => import("./pages/ContactPage.jsx"));
const SupplierPortal = React.lazy(() => import("./pages/SupplierPortal.jsx"));
const SupplierSignup = React.lazy(() => import("./pages/SupplierSignup.jsx"));
const SupplierDashboardPage = React.lazy(() => import("./pages/SupplierDashboardPage.jsx"));
const SupplierBookingsPage = React.lazy(() => import("./pages/SupplierBookingsPage.jsx"));
const TourProductBuilder = React.lazy(() => import("./pages/TourProductBuilder.jsx"));
const SupplierListingChooser = React.lazy(() => import("./pages/SupplierListingChooser.jsx"));
const SupplierTransferBuilder = React.lazy(() => import("./pages/SupplierTransferBuilder.jsx"));
const AdminPanel = React.lazy(() => import("./pages/AdminPanel.jsx"));
const OpsPanel = React.lazy(() => import("./pages/OpsPanel.jsx"));
const UserProfile = React.lazy(() => import("./pages/UserProfile.jsx"));
const WishlistPage = React.lazy(() => import("./pages/WishlistPage.jsx"));
const TravelerMessages = React.lazy(() => import("./pages/TravelerMessages.jsx"));
const TripSummary = React.lazy(() => import("./pages/TripSummary.jsx"));
const NotFound404 = React.lazy(() => import("./pages/NotFound404.jsx"));

function AppContent() {
  const location = useLocation();
  const { user } = useAuth();
  const isWorkspace = ["/supplier", "/admin", "/ops"].some((prefix) => location.pathname.startsWith(prefix));

  React.useEffect(() => {
    analytics.trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans pb-16 md:pb-0">
      {!isWorkspace && <Navbar />}
      <main className="flex-1">
        <React.Suspense fallback={<div className="grid min-h-[55vh] place-items-center bg-[#FAF9F6] dark:bg-stone-950 text-sm font-semibold text-stone-600 dark:text-stone-400">Loading your Idea Holiday workspace…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/transfers" element={<TransferSearch />} />
            <Route path="/profile" element={<UserProfile />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/messages" element={<TravelerMessages />} />
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
            <Route path="/admin/analytics" element={<AdminPanel view="analytics" />} />
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
            <Route path="/my-bookings" element={<MyBookings />} />
            <Route path="/my-reviews" element={<MyReviews />} />
            <Route path="/reviews" element={<MyReviews />} />
            <Route path="/trip-summary/:id" element={<TripSummary />} />
            <Route path="/trip/:id" element={<TripSummary />} />
            <Route path="/login" element={<Login />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/cancellation" element={<CancellationPage />} />
            <Route path="/about-us" element={<AboutPage />} />
            <Route path="/contact-us" element={<ContactPage />} />
            <Route path="*" element={<NotFound404 />} />
          </Routes>
        </React.Suspense>
      </main>
      {!isWorkspace && <Footer />}
      {!isWorkspace && <MobileBottomNav user={user} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <ErrorBoundary>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </ErrorBoundary>
      </CurrencyProvider>
    </AuthProvider>
  );
}
