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
  "stock.manage",
  "staff.manage",
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
] as const satisfies readonly Permission[];

const CASHIER_PERMISSIONS = [
  ...WAITER_PERMISSIONS,
  "order.view.all",
  "order.reprint",
  "payment.create",
  "shift.manage",
] as const satisfies readonly Permission[];

/**
 * Cashier does not hold cancellation.approve or order.discount outright.
 * Those require an admin override. Admin holds every permission.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  WAITER: WAITER_PERMISSIONS,
  CASHIER: CASHIER_PERMISSIONS,
  ADMIN: PERMISSIONS,
};

const CASHIER_OVERRIDE_PERMISSIONS = ["cancellation.approve", "order.discount"] as const;

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
