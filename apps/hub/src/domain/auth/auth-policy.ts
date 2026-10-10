import type { DeviceType, Role } from "@resto/shared";

export interface LoginUser {
  role: Role;
  isActive: boolean;
  hasPassword: boolean;
}

export interface LoginDevice {
  type: DeviceType;
  isActive: boolean;
}

export type LoginDenial =
  | "INACTIVE_USER"
  | "DEVICE_REQUIRED"
  | "DEVICE_INACTIVE"
  | "DEVICE_NOT_ALLOWED"
  | "PASSWORD_REQUIRED";

export type LoginDecision = { ok: true } | { ok: false; reason: LoginDenial };

const PIN_DEVICE: Partial<Record<Role, DeviceType>> = {
  WAITER: "TABLET",
  CASHIER: "CASHIER_PC",
};

/**
 * Waiter and cashier need an active device of their own kind.
 * A phone or a personal computer accepts only an admin.
 * An admin may sign in with a password, with or without a device.
 */
export function canLogin(user: LoginUser, device: LoginDevice | null): LoginDecision {
  if (!user.isActive) {
    return { ok: false, reason: "INACTIVE_USER" };
  }
  if (user.role === "ADMIN") {
    if (!user.hasPassword) {
      return { ok: false, reason: "PASSWORD_REQUIRED" };
    }
    if (device && !device.isActive) {
      return { ok: false, reason: "DEVICE_INACTIVE" };
    }
    return { ok: true };
  }
  if (!device) {
    return { ok: false, reason: "DEVICE_REQUIRED" };
  }
  if (!device.isActive) {
    return { ok: false, reason: "DEVICE_INACTIVE" };
  }
  if (PIN_DEVICE[user.role] !== device.type) {
    return { ok: false, reason: "DEVICE_NOT_ALLOWED" };
  }
  return { ok: true };
}
