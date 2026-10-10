import { describe, expect, it } from "vitest";

import { newId } from "../ids.js";
import {
  addItemsSchema,
  createOrderSchema,
  decideCancellationSchema,
  loginAdminSchema,
  loginPinSchema,
  registerDeviceSchema,
  requestCancellationSchema,
} from "./index.js";

const productId = "0199c0a0-0000-7000-8000-000000000010";

describe("dto schemas", () => {
  it("accepts a waiter pin login and rejects unknown fields", () => {
    const userId = newId();
    expect(loginPinSchema.parse({ userId, pin: "1234" })).toEqual({ userId, pin: "1234" });
    expect(loginPinSchema.safeParse({ userId, pin: "1234", extra: true }).success).toBe(false);
    expect(loginPinSchema.safeParse({ userId, pin: "12" }).success).toBe(false);
    expect(loginPinSchema.safeParse({ userId, pin: "1234567" }).success).toBe(false);
  });

  it("requires a real email and an 8 character admin password", () => {
    expect(
      loginAdminSchema.safeParse({ email: "admin@resto.local", password: "short" }).success,
    ).toBe(false);
    expect(
      loginAdminSchema.parse({ email: "admin@resto.local", password: "Admin#2026dev" }).email,
    ).toBe("admin@resto.local");
  });

  it("validates orders, items, devices, and cancellations", () => {
    const orderId = newId();
    expect(
      createOrderSchema.parse({
        id: orderId,
        tableId: null,
        items: [{ productId, quantity: 1, note: "sans sucre" }],
      }).id,
    ).toBe(orderId);
    expect(createOrderSchema.safeParse({ id: orderId, items: [] }).success).toBe(false);
    expect(addItemsSchema.safeParse({ items: [{ productId, quantity: 100 }] }).success).toBe(false);
    expect(registerDeviceSchema.parse({ name: "Salle 1", type: "TABLET" }).type).toBe("TABLET");
    expect(requestCancellationSchema.safeParse({ reason: "no" }).success).toBe(false);
    expect(
      decideCancellationSchema.parse({
        approve: false,
        adminOverride: { email: "admin@resto.local", password: "secret" },
      }).approve,
    ).toBe(false);
    expect(decideCancellationSchema.safeParse({ approve: true, extra: 1 }).success).toBe(false);
  });
});
