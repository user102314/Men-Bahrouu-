import { describe, expect, it } from "vitest";

import { canLogin, type LoginDevice, type LoginUser } from "./auth-policy.js";

const waiter: LoginUser = { role: "WAITER", isActive: true, hasPassword: false };
const cashier: LoginUser = { role: "CASHIER", isActive: true, hasPassword: false };
const admin: LoginUser = { role: "ADMIN", isActive: true, hasPassword: true };

const tablet: LoginDevice = { type: "TABLET", isActive: true };
const cashierPc: LoginDevice = { type: "CASHIER_PC", isActive: true };
const phone: LoginDevice = { type: "PHONE", isActive: true };
const personal: LoginDevice = { type: "PERSONAL", isActive: true };

describe("canLogin", () => {
  it("lets a waiter use only an active tablet", () => {
    expect(canLogin(waiter, tablet)).toEqual({ ok: true });
    expect(canLogin(waiter, null)).toEqual({ ok: false, reason: "DEVICE_REQUIRED" });
    expect(canLogin(waiter, phone)).toEqual({ ok: false, reason: "DEVICE_NOT_ALLOWED" });
    expect(canLogin(waiter, cashierPc)).toEqual({ ok: false, reason: "DEVICE_NOT_ALLOWED" });
    expect(canLogin(waiter, { ...tablet, isActive: false })).toEqual({
      ok: false,
      reason: "DEVICE_INACTIVE",
    });
  });

  it("lets a cashier use only an active cashier PC", () => {
    expect(canLogin(cashier, cashierPc)).toEqual({ ok: true });
    expect(canLogin(cashier, tablet)).toEqual({ ok: false, reason: "DEVICE_NOT_ALLOWED" });
  });

  it("lets an admin sign in from a phone, a personal computer, or no device", () => {
    expect(canLogin(admin, phone)).toEqual({ ok: true });
    expect(canLogin(admin, personal)).toEqual({ ok: true });
    expect(canLogin(admin, null)).toEqual({ ok: true });
    expect(canLogin(admin, { ...phone, isActive: false })).toEqual({
      ok: false,
      reason: "DEVICE_INACTIVE",
    });
    expect(canLogin({ ...admin, hasPassword: false }, null)).toEqual({
      ok: false,
      reason: "PASSWORD_REQUIRED",
    });
    expect(canLogin({ ...admin, isActive: false }, phone)).toEqual({
      ok: false,
      reason: "INACTIVE_USER",
    });
  });
});
