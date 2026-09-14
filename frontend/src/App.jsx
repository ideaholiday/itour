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
import { api } from "./lib/api.js";
import { parseReferralParams, captureReferral, parseTravelerReferralParams, captureTravelerReferral } from "./lib/affiliateAttribution.js";

const DriverTrip = React.lazy(() => import("./pages/DriverTrip.jsx"));
const TripTracking = React.lazy(() => import("./pages/TripTracking.jsx"));
const Home = React.lazy(() => import("./pages/Home.jsx"));
const Search = React.lazy(() => import("./pages/Search.jsx"));
const TransferSearch = React.lazy(() => import("./pages/TransferSearch.jsx"));
const ActivityDetail = React.lazy(() => import("./pages/ActivityDetail.jsx"));
const Checkout = React.lazy(() => import("./pages/Checkout.jsx"));
const BookingConfirmed = React.lazy(() => import("./pages/BookingConfirmed.jsx"));
const MyBookings = React.lazy(() => import("./pages/MyBookings.jsx"));
const MyReviews = React.lazy(() => import("./pages/MyReviews.jsx"));
const ReviewInvite = React.lazy(() => import("./pages/ReviewInvite.jsx"));
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
const ProductBuilder = React.lazy(() => import("./pages/ProductBuilder.jsx"));
const SupplierChannelManagerPage = React.lazy(() => import("./pages/supplier/SupplierChannelManagerPage.jsx"));
const SupplierLoginPage = React.lazy(() => import("./pages/SupplierLoginPage.jsx"));
const AdminLoginPage = React.lazy(() => import("./pages/AdminLoginPage.jsx"));
import { getDomainInfo, getPortalUrls } from "./lib/domainContext.js";

const AdminPanel = React.lazy(() => import("./pages/AdminPanel.jsx"));
const OpsPanel = React.lazy(() => import("./pages/OpsPanel.jsx"));
const UserProfile = React.lazy(() => import("./pages/UserProfile.jsx"));
const WishlistPage = React.lazy(() => import("./pages/WishlistPage.jsx"));
const TravelerMessages = React.lazy(() => import("./pages/TravelerMessages.jsx"));
const SupplierProfile = React.lazy(() => import("./pages/SupplierProfile.jsx"));
const SupplierDirectory = React.lazy(() => import("./pages/SupplierDirectory.jsx"));
const TripSummary = React.lazy(() => import("./pages/TripSummary.jsx"));
const TravelAndEarn = React.lazy(() => import("./pages/TravelAndEarn.jsx"));
const AffiliateLandingPage = React.lazy(() => import("./pages/AffiliateLandingPage.jsx"));
const AffiliateDashboardPage = React.lazy(() => import("./pages/AffiliateDashboardPage.jsx"));
const CircuitPlanner = React.lazy(() => import("./pages/CircuitPlanner.jsx"));
const CircuitCheckout = React.lazy(() => import("./pages/CircuitCheckout.jsx"));
const CircuitConfirmed = React.lazy(() => import("./pages/CircuitConfirmed.jsx"));
const CircuitManage = React.lazy(() => import("./pages/CircuitManage.jsx"));
const NotFound404 = React.lazy(() => import("./pages/NotFound404.jsx"));

function AppContent() {
  const location = useLocation();
  const { user } = useAuth();
  const domain = getDomainInfo();
  const portalUrls = getPortalUrls();
  // Match whole path segments, so the public /suppliers directory keeps the traveler layout.
  const isWorkspace = ["/supplier", "/admin", "/ops", "/driver", "/track"].some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`)) || domain.isSupplier || domain.isAdmin;

  React.useEffect(() => {
    analytics.trackPageView(location.pathname + location.search);

    const referral = parseReferralParams(location.search);
    if (referral) {
      captureReferral(api, {
        code: referral.code,
        subId: referral.subId,
        path: location.pathname,
        referrer: document.referrer || "",
      });
    }

    const travelerReferral = parseTravelerReferralParams(location.search);
    if (travelerReferral) {
      captureTravelerReferral(api, { code: travelerReferral.code, channel: travelerReferral.channel, path: location.pathname });
    }
  }, [location.pathname, location.search]);

  const userRole = String(user?.role || user?.user_metadata?.role || "").toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans pb-16 md:pb-0">
      {/* Cross-Domain Portal Switcher Banner for Logged-In Operators on Traveler Site */}
      {domain.isTraveler && (userRole === "SUPPLIER" || userRole === "ADMIN" || userRole === "STAFF") && (
        <div className="bg-stone-900 text-stone-300 text-xs px-4 py-2 border-b border-stone-800 flex items-center justify-between">
          <span>
            Logged in as <strong className="text-amber-400">{userRole}</strong> ({user?.email})
          </span>
          <a
            href={userRole === "SUPPLIER" ? portalUrls.supplier : portalUrls.admin}
            className="font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2"
          >
            Switch to {userRole === "SUPPLIER" ? "Supplier Portal (supply.ideaholiday.in)" : "Admin Panel (admin.ideaholiday.in)"} →
          </a>
        </div>
      )}
      {!isWorkspace && <Navbar />}
      <main className="flex-1">
        <React.Suspense fallback={
          <div className="grid min-h-[55vh] place-items-center bg-[#FAF9F6] dark:bg-stone-950">
            <div className="flex flex-col items-center gap-4">
              <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-glow-gold animate-pulse-glow">
                <span className="text-2xl font-black text-stone-950 font-display">IH</span>
              </div>
              <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 tracking-wider uppercase">Loading…</p>
            </div>
          </div>
        }>
          <Routes>
            <Route path="/driver/trip" element={<DriverTrip />} />
            <Route path="/track/:ref" element={<TripTracking />} />
            {/* Root Route Handled According to Domain */}
            <Route
              path="/"
              element={
                domain.isSupplier ? (
                  userRole === "SUPPLIER" ? <SupplierDashboardPage /> : <SupplierLoginPage />
                ) : domain.isAdmin ? (
                  userRole === "ADMIN" ? <AdminPanel view="overview" /> : userRole === "STAFF" ? <OpsPanel view="live" /> : <AdminLoginPage />
                ) : (
                  <Home />
                )
              }
            />
            {/* Public review collection: a mailed invite token, or a supplier's shared link / QR. */}
            <Route path="/review/:token" element={<ReviewInvite mode="token" />} />
            <Route path="/r/:slug" element={<ReviewInvite mode="share" />} />
            <Route path="/search" element={<Search />} />
            <Route path="/transfers" element={<TransferSearch />} />
            <Route path="/profile" element={<UserProfile />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/messages" element={<TravelerMessages />} />
            <Route path="/suppliers" element={<SupplierDirectory />} />
            <Route path="/suppliers/in/:citySlug" element={<SupplierDirectory />} />
            <Route path="/suppliers/:slug" element={<SupplierProfile />} />
            <Route path="/supplier" element={<SupplierDashboardPage />} />
            <Route path="/supplier/signup" element={<SupplierSignup />} />
            <Route path="/supplier/dashboard" element={<SupplierDashboardPage />} />
            <Route path="/supplier/bookings" element={<SupplierBookingsPage />} />
            <Route path="/supplier/portal" element={<SupplierPortal />} />
            <Route path="/supplier/coverage" element={<SupplierDashboardPage />} />
            <Route path="/supplier/channels" element={<SupplierChannelManagerPage />} />
            <Route path="/supplier/login" element={<SupplierLoginPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/supplier/products/create" element={<SupplierListingChooser />} />
            <Route path="/supplier/products/new" element={<ProductBuilder />} />
            <Route path="/supplier/transfers/create" element={<SupplierTransferBuilder />} />
            <Route path="/supplier/tours/create" element={<TourProductBuilder />} />
            <Route path="/admin" element={<AdminPanel view="overview" />} />
            <Route path="/admin/analytics" element={<AdminPanel view="analytics" />} />
            <Route path="/admin/suppliers" element={<AdminPanel view="suppliers" />} />
            <Route path="/admin/products" element={<AdminPanel view="products" />} />
            <Route path="/admin/finance" element={<AdminPanel view="finance" />} />
            <Route path="/admin/quality" element={<AdminPanel view="quality" />} />
            <Route path="/admin/creators" element={<AdminPanel view="creators" />} />
            <Route path="/admin/referrals" element={<AdminPanel view="referrals" />} />
            <Route path="/admin/team" element={<AdminPanel view="team" />} />
            <Route path="/admin/programs" element={<AdminPanel view="programs" />} />
            <Route path="/admin/coupons" element={<AdminPanel view="coupons" />} />
            <Route path="/ops" element={<OpsPanel view="live" />} />
            <Route path="/ops/live" element={<OpsPanel view="live" />} />
            <Route path="/ops/notifications" element={<OpsPanel view="notifications" />} />
            <Route path="/ops/support" element={<OpsPanel view="support" />} />
            <Route path="/ops/tasks" element={<OpsPanel view="tasks" />} />
            <Route path="/ops/circuits" element={<OpsPanel view="circuits" />} />
            <Route path="/activity/:id" element={<ActivityDetail />} />
            <Route path="/activity/:slug/:id" element={<ActivityDetail />} />
            <Route path="/checkout/:id" element={<Checkout />} />
            <Route path="/booking-confirmed/:ref" element={<BookingConfirmed />} />
            <Route path="/bookings" element={<MyBookings />} />
            <Route path="/my-bookings" element={<MyBookings />} />
            <Route path="/my-reviews" element={<MyReviews />} />
            <Route path="/reviews" element={<MyReviews />} />
            <Route path="/trip-summary/:id" element={<TripSummary />} />
            <Route path="/trip/:id" element={<TripSummary />} />
            <Route path="/travel-and-earn" element={<TravelAndEarn />} />
            <Route path="/referrals" element={<TravelAndEarn />} />
            <Route path="/affiliate" element={<AffiliateLandingPage />} />
            <Route path="/influencer" element={<AffiliateLandingPage />} />
            <Route path="/affiliate/dashboard" element={<AffiliateDashboardPage />} />
            <Route path="/circuit-planner" element={<CircuitPlanner />} />
            <Route path="/plan-trip" element={<CircuitPlanner />} />
            <Route path="/circuit-checkout/:id" element={<CircuitCheckout />} />
            <Route path="/circuit-confirmed/:ref" element={<CircuitConfirmed />} />
            <Route path="/circuit/:ref/manage" element={<CircuitManage />} />
            <Route
              path="/login"
              element={domain.isSupplier ? <SupplierLoginPage /> : domain.isAdmin ? <AdminLoginPage /> : <Login />}
            />
            <Route path="/signup" element={<Login initialMode="signup" />} />
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
