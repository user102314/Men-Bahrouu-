import type { Role } from "@resto/shared";
import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { homeFor, loadSession } from "../lib/session.js";

export function RoleGuard({ allow, children }: { allow: readonly Role[]; children: ReactNode }) {
  const session = loadSession();
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (!allow.includes(session.role)) {
    return <Navigate to={homeFor(session.role)} replace />;
  }
  return children;
}
