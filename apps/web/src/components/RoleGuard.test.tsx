import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { clearSession, saveSession, type Session } from "../lib/session.js";
import { RoleGuard } from "./RoleGuard.js";

function session(role: Session["role"]): Session {
  return {
    token: "header.payload.sig",
    role,
    userId: "0199c0a0-0000-7000-8000-000000000010",
    displayName: "Sonia",
    expiresAt: Date.now() + 60_000,
  };
}

function renderGuard(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>login-screen</div>} />
        <Route path="/cashier" element={<div>cashier-screen</div>} />
        <Route
          path="/waiter"
          element={
            <RoleGuard allow={["WAITER", "ADMIN"]}>
              <div>waiter-screen</div>
            </RoleGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoleGuard", () => {
  beforeEach(() => {
    clearSession();
  });

  it("sends an anonymous visitor to login", () => {
    renderGuard("/waiter");
    expect(screen.getByText("login-screen")).toBeTruthy();
  });

  it("sends a cashier away from the waiter screen", () => {
    saveSession(session("CASHIER"));
    renderGuard("/waiter");
    expect(screen.getByText("cashier-screen")).toBeTruthy();
  });

  it("lets a waiter in", () => {
    saveSession(session("WAITER"));
    renderGuard("/waiter");
    expect(screen.getByText("waiter-screen")).toBeTruthy();
  });
});
