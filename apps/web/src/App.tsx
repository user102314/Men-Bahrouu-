import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { AdminShell } from "./components/admin/AdminShell.js";
import { Frame } from "./components/Frame.js";
import { HubLinkProvider } from "./components/HubLink.js";
import { RoleGuard } from "./components/RoleGuard.js";
import { queryClient } from "./lib/query.js";
import { CashierPage } from "./pages/CashierPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { WaiterPage } from "./pages/WaiterPage.js";

const DashboardPage = lazy(() => import("./pages/admin/DashboardPage.js").then((module) => ({ default: module.DashboardPage })));
const OrdersPage = lazy(() => import("./pages/admin/OrdersPage.js").then((module) => ({ default: module.OrdersPage })));
const AlertsPage = lazy(() => import("./pages/admin/AlertsPage.js").then((module) => ({ default: module.AlertsPage })));
const ProductsPage = lazy(() => import("./pages/admin/ProductsPage.js").then((module) => ({ default: module.ProductsPage })));
const DailyPlanPage = lazy(() => import("./pages/admin/DailyPlanPage.js").then((module) => ({ default: module.DailyPlanPage })));
const CategoriesPage = lazy(() => import("./pages/admin/CategoriesPage.js").then((module) => ({ default: module.CategoriesPage })));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage.js").then((module) => ({ default: module.SettingsPage })));
const PrintersPage = lazy(() => import("./pages/admin/PrintersPage.js").then((module) => ({ default: module.PrintersPage })));
const DevicesPage = lazy(() => import("./pages/admin/DevicesPage.js").then((module) => ({ default: module.DevicesPage })));
const RecettesPage = lazy(() => import("./pages/admin/RecettesPage.js").then((module) => ({ default: module.RecettesPage })));
const StaffPage = lazy(() => import("./pages/admin/StaffPage.js").then((module) => ({ default: module.StaffPage })));

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HubLinkProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Frame />}>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/waiter"
                element={
                  <RoleGuard allow={["WAITER", "ADMIN"]}>
                    <WaiterPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/cashier"
                element={
                  <RoleGuard allow={["CASHIER", "ADMIN"]}>
                    <CashierPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin"
                element={
                  <RoleGuard allow={["ADMIN"]}>
                    <AdminShell />
                  </RoleGuard>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={null}>
                      <DashboardPage />
                    </Suspense>
                  }
                />
                <Route path="orders" element={<Suspense fallback={null}><OrdersPage /></Suspense>} />
                <Route path="alerts" element={<Suspense fallback={null}><AlertsPage /></Suspense>} />
                <Route path="products" element={<Suspense fallback={null}><ProductsPage /></Suspense>} />
                <Route path="daily" element={<Suspense fallback={null}><DailyPlanPage /></Suspense>} />
                <Route path="categories" element={<Suspense fallback={null}><CategoriesPage /></Suspense>} />
                <Route path="settings" element={<Suspense fallback={null}><SettingsPage /></Suspense>} />
                <Route path="printers" element={<Suspense fallback={null}><PrintersPage /></Suspense>} />
                <Route path="devices" element={<Suspense fallback={null}><DevicesPage /></Suspense>} />
                <Route path="recettes" element={<Suspense fallback={null}><RecettesPage /></Suspense>} />
                <Route path="staff" element={<Suspense fallback={null}><StaffPage /></Suspense>} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </HubLinkProvider>
    </QueryClientProvider>
  );
}
