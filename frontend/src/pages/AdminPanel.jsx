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

export default function AdminPanel({ view }) {
  const location = useLocation();

  let activeView = view;
  if (!activeView) {
    if (location.pathname.includes("/analytics")) activeView = "analytics";
    else if (location.pathname.includes("/suppliers")) activeView = "suppliers";
    else if (location.pathname.includes("/products")) activeView = "products";
    else if (location.pathname.includes("/finance")) activeView = "finance";
    else if (location.pathname.includes("/quality")) activeView = "quality";
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
      </AdminLayout>
    </AdminGuard>
  );
}
