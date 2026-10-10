import { can, type Permission, type Role } from "@resto/shared";

export function hubCan(role: Role, permission: Permission): boolean {
  return can(role, permission);
}
