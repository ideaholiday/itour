import React from "react";
import { useLocation, Navigate } from "react-router-dom";
import AdminGuard from "../components/admin/AdminGuard.jsx";
import AdminLayout from "../components/admin/AdminLayout.jsx";
import SupplierApprovalView from "./admin/SupplierApprovalView.jsx";
import ProductModerationView from "./admin/ProductModerationView.jsx";
import FinanceOverviewView from "./admin/FinanceOverviewView.jsx";
import AdminOverviewView from "./admin/AdminOverviewView.jsx";
import QualityReviewsView from "./admin/QualityReviewsView.jsx";
import AnalyticsDashboardView from "./admin/AnalyticsDashboardView.jsx";
import AffiliatePayoutsView from "./admin/AffiliatePayoutsView.jsx";
import ReferralProgramView from "./admin/ReferralProgramView.jsx";
import TeamView from "./admin/TeamView.jsx";
import ProgramsView from "./admin/ProgramsView.jsx";
import CouponsView from "./admin/CouponsView.jsx";
import VerificationQueueView from "./admin/VerificationQueueView.jsx";

export default function AdminPanel({ view }) {
  const location = useLocation();

  let activeView = view;
  if (!activeView) {
    if (location.pathname.includes("/analytics")) activeView = "analytics";
    else if (location.pathname.includes("/suppliers")) activeView = "suppliers";
    else if (location.pathname.includes("/products")) activeView = "products";
    else if (location.pathname.includes("/finance")) activeView = "finance";
    else if (location.pathname.includes("/quality")) activeView = "quality";
    else if (location.pathname.includes("/creators")) activeView = "creators";
    else if (location.pathname.includes("/referrals")) activeView = "referrals";
    else if (location.pathname.includes("/team")) activeView = "team";
    else if (location.pathname.includes("/programs")) activeView = "programs";
    else if (location.pathname.includes("/coupons")) activeView = "coupons";
    else if (location.pathname.includes("/verifications")) activeView = "verifications";
    else activeView = "overview";
  }

  return (
    <AdminGuard>
      <AdminLayout>
        {activeView === "overview" && <AdminOverviewView />}
        {activeView === "analytics" && <AnalyticsDashboardView />}
        {activeView === "suppliers" && <SupplierApprovalView />}
        {activeView === "products" && <ProductModerationView />}
        {activeView === "finance" && <FinanceOverviewView />}
        {activeView === "quality" && <QualityReviewsView />}
        {activeView === "creators" && <AffiliatePayoutsView />}
        {activeView === "referrals" && <ReferralProgramView />}
        {activeView === "team" && <TeamView />}
        {activeView === "programs" && <ProgramsView />}
        {activeView === "coupons" && <CouponsView />}
        {activeView === "verifications" && <VerificationQueueView />}
      </AdminLayout>
    </AdminGuard>
  );
}
