import { describe, expect, it } from "vitest";

import { ROLES, type Role } from "../domain/enums.js";
import { PERMISSIONS, type Permission, can, requiresAdminOverride } from "./index.js";

/**
 * Hand-written expectation. Do not derive this from ROLE_PERMISSIONS.
 * Cashier rows omit cancellation.approve and order.discount: those need an admin override.
 */
const EXPECTED: Record<Role, readonly Permission[]> = {
  WAITER: [
    "order.create",
    "order.addItems",
    "order.send",
    "order.view.own",
    "order.markServed",
    "cancellation.request",
  ],
  CASHIER: [
    "order.create",
    "order.addItems",
    "order.send",
    "order.view.own",
    "order.view.all",
    "order.markServed",
    "order.reprint",
    "cancellation.request",
    "payment.create",
    "shift.manage",
  ],
  ADMIN: [
    "order.create",
    "order.addItems",
    "order.send",
    "order.view.own",
    "order.view.all",
    "order.markServed",
    "order.reprint",
    "order.discount",
    "cancellation.request",
    "cancellation.approve",
    "payment.create",
    "shift.manage",
    "catalog.edit",
    "stock.manage",
    "staff.manage",
    "device.manage",
    "printer.manage",
    "audit.view",
    "settings.edit",
    "report.view",
  ],
};

const CASHIER_OVERRIDES: readonly Permission[] = ["cancellation.approve", "order.discount"];

describe("permission matrix", () => {
  it("matches the hand-written role matrix for every permission", () => {
    for (const role of ROLES) {
      const granted = new Set(EXPECTED[role]);
      for (const permission of PERMISSIONS) {
        expect(can(role, permission), `${role} ${permission}`).toBe(granted.has(permission));
      }
    }
  });

  it("requires an admin override only for a cashier approval or discount", () => {
    for (const role of ROLES) {
      for (const permission of PERMISSIONS) {
        const expected = role === "CASHIER" && CASHIER_OVERRIDES.includes(permission);
        expect(requiresAdminOverride(role, permission), `${role} ${permission}`).toBe(expected);
      }
    }
  });
});
