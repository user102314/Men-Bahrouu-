import type { Role } from "../domain/enums.js";

export const PERMISSIONS = [
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
  "catalog.availability",
  "stock.manage",
  "inventory.manage",
  "purchase.manage",
  "expense.manage",
  "staff.manage",
  "attendance.self",
  "attendance.manage",
  "device.manage",
  "printer.manage",
  "audit.view",
  "settings.edit",
  "report.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const WAITER_PERMISSIONS = [
  "order.create",
  "order.addItems",
  "order.send",
  "order.view.own",
  "order.markServed",
  "cancellation.request",
  "attendance.self",
] as const satisfies readonly Permission[];

const CASHIER_PERMISSIONS = [
  ...WAITER_PERMISSIONS,
  "order.view.all",
  "order.reprint",
  "cancellation.approve",
  "payment.create",
  "shift.manage",
  "catalog.availability",
] as const satisfies readonly Permission[];

/**
 * Cashier holds cancellation.approve. order.discount still needs an admin override.
 * Admin holds every permission.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  WAITER: WAITER_PERMISSIONS,
  CASHIER: CASHIER_PERMISSIONS,
  ADMIN: PERMISSIONS,
};

const CASHIER_OVERRIDE_PERMISSIONS = ["order.discount"] as const;

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** True when a cashier may perform the action only by presenting an admin credential. */
export function requiresAdminOverride(role: Role, permission: Permission): boolean {
  return (
    role === "CASHIER" &&
    (CASHIER_OVERRIDE_PERMISSIONS as readonly Permission[]).includes(permission)
  );
}
