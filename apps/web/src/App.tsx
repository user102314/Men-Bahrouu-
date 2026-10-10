import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { Frame } from "./components/Frame.js";
import { HubLinkProvider } from "./components/HubLink.js";
import { RoleGuard } from "./components/RoleGuard.js";
import { queryClient } from "./lib/query.js";
import { AdminSoonPage } from "./pages/AdminSoonPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { WaiterPage } from "./pages/WaiterPage.js";

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
                path="/admin"
                element={
                  <RoleGuard allow={["ADMIN"]}>
                    <AdminSoonPage />
                  </RoleGuard>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </HubLinkProvider>
    </QueryClientProvider>
  );
}
