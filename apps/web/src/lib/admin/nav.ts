import { can, type Permission, type Role } from "@resto/shared";

export type NavGroup = "pilot" | "catalog" | "stock" | "team" | "finance" | "system";

export interface NavItem {
  to: string;
  labelKey: string;
  group: NavGroup;
  permission: Permission;
  later: boolean;
}

export const NAV: readonly NavItem[] = [
  { to: "/admin", labelKey: "admin.dashboard", group: "pilot", permission: "report.view", later: false },
  { to: "/admin/orders", labelKey: "admin.orders", group: "pilot", permission: "order.view.all", later: false },
  { to: "/admin/alerts", labelKey: "admin.alerts", group: "pilot", permission: "report.view", later: false },
  { to: "/admin/products", labelKey: "admin.products", group: "catalog", permission: "catalog.edit", later: false },
  { to: "/admin/categories", labelKey: "admin.categories", group: "catalog", permission: "catalog.edit", later: false },
  { to: "/admin/stock", labelKey: "admin.nav.stock", group: "stock", permission: "stock.manage", later: true },
  { to: "/admin/purchases", labelKey: "admin.nav.purchases", group: "stock", permission: "purchase.manage", later: true },
  { to: "/admin/inventory", labelKey: "admin.nav.inventory", group: "stock", permission: "inventory.manage", later: true },
  { to: "/admin/staff", labelKey: "admin.nav.staff", group: "team", permission: "staff.manage", later: true },
  { to: "/admin/attendance", labelKey: "admin.nav.attendance", group: "team", permission: "attendance.manage", later: true },
  { to: "/admin/planning", labelKey: "admin.nav.planning", group: "team", permission: "staff.manage", later: true },
  { to: "/admin/cash", labelKey: "admin.nav.cash", group: "finance", permission: "shift.manage", later: true },
  { to: "/admin/expenses", labelKey: "admin.nav.expenses", group: "finance", permission: "expense.manage", later: true },
  { to: "/admin/reports", labelKey: "admin.nav.reports", group: "finance", permission: "report.view", later: true },
  { to: "/admin/settings", labelKey: "admin.settings", group: "system", permission: "settings.edit", later: false },
  { to: "/admin/printers", labelKey: "admin.printers", group: "system", permission: "printer.manage", later: false },
  { to: "/admin/devices", labelKey: "admin.devices", group: "system", permission: "device.manage", later: false },
  { to: "/admin/audit", labelKey: "admin.nav.audit", group: "system", permission: "audit.view", later: true },
];

export const NAV_GROUPS: readonly NavGroup[] = ["pilot", "catalog", "stock", "team", "finance", "system"];

export function visibleNav(role: Role): NavItem[] {
  return NAV.filter((item) => can(role, item.permission));
}
