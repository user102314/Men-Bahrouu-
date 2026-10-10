import { newId, type DeviceType, type Role } from "@resto/shared";

import { canLogin } from "../domain/auth/auth-policy.js";
import type { Clock } from "../domain/auth/clock.js";
import type {
  AuditRepository,
  DeviceRepository,
  SecretHasher,
  StoredDevice,
  StoredUser,
  UserRepository,
} from "./ports.js";

export type AuthFailure = {
  ok: false;
  code: "AUTH_INVALID" | "AUTH_LOCKED" | "DEVICE_NOT_ALLOWED";
  retryAfterSeconds?: number;
};

export type SessionGrant = {
  ok: true;
  userId: string;
  role: Role;
  siteId: string;
  deviceId: string | null;
  expiresInSeconds: number;
};

export interface AuthServiceOptions {
  siteId: string;
  lockoutAttempts: number;
  lockoutSeconds: number;
  waiterSessionSeconds: number;
  adminSessionSeconds: number;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly devices: DeviceRepository,
    private readonly audit: AuditRepository,
    private readonly hasher: SecretHasher,
    private readonly clock: Clock,
    private readonly options: AuthServiceOptions,
    private readonly dummyHash: string,
    private readonly hashToken: (token: string) => string,
  ) {}

  async loginWithPin(
    userId: string,
    pin: string,
    deviceToken: string | null,
  ): Promise<SessionGrant | AuthFailure> {
    const user = await this.users.findById(userId);
    if (!user || user.siteId !== this.options.siteId) {
      await this.hasher.verify(this.dummyHash, pin);
      await this.auditFailure(null, null, "user");
      return { ok: false, code: "AUTH_INVALID" };
    }
    return this.finishLogin(user, user.pinHash, pin, deviceToken);
  }

  async loginAdmin(
    email: string,
    password: string,
    deviceToken: string | null,
  ): Promise<SessionGrant | AuthFailure> {
    const user = await this.users.findByEmail(this.options.siteId, email);
    if (!user) {
      await this.hasher.verify(this.dummyHash, password);
      await this.auditFailure(null, null, "user");
      return { ok: false, code: "AUTH_INVALID" };
    }
    return this.finishLogin(user, user.passwordHash, password, deviceToken);
  }

  async profiles(
    deviceToken: string,
  ): Promise<
    { ok: true; profiles: { id: string; displayName: string; role: Role }[] } | AuthFailure
  > {
    const device = await this.findPresentedDevice(deviceToken);
    if (!device) {
      return { ok: false, code: "AUTH_INVALID" };
    }
    if (!device.isActive) {
      return { ok: false, code: "DEVICE_NOT_ALLOWED" };
    }
    const staff = await this.users.listActiveStaff(this.options.siteId);
    const profiles = staff
      .filter((user) => canLogin(toLoginUser(user), device).ok)
      .map((user) => ({ id: user.id, displayName: user.displayName, role: user.role }));
    return { ok: true, profiles };
  }

  async logout(actorUserId: string, deviceId: string | null): Promise<void> {
    await this.audit.record({
      siteId: this.options.siteId,
      actorUserId,
      deviceId,
      action: "auth.logout",
      entityType: "user",
      entityId: actorUserId,
      before: null,
      after: null,
    });
  }

  async registerDevice(
    actorUserId: string,
    name: string,
    type: DeviceType,
    token: string,
    tokenHash: string,
  ) {
    const id = newId();
    await this.devices.insert({ id, siteId: this.options.siteId, name, type, tokenHash });
    await this.audit.record({
      siteId: this.options.siteId,
      actorUserId,
      deviceId: null,
      action: "device.registered",
      entityType: "device",
      entityId: id,
      before: null,
      after: { id, name, type },
    });
    return { id, name, type, token };
  }

  listDevices(): Promise<StoredDevice[]> {
    return this.devices.list(this.options.siteId);
  }

  async revokeDevice(actorUserId: string, deviceId: string): Promise<StoredDevice | null> {
    const existing = await this.devices.findById(deviceId);
    if (!existing || existing.siteId !== this.options.siteId) {
      return null;
    }
    const revoked = await this.devices.revoke(deviceId);
    await this.audit.record({
      siteId: this.options.siteId,
      actorUserId,
      deviceId: null,
      action: "device.revoked",
      entityType: "device",
      entityId: deviceId,
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });
    return revoked;
  }

  async activeSession(userId: string, deviceId: string | null): Promise<StoredUser | null> {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive || user.siteId !== this.options.siteId) {
      return null;
    }
    if (deviceId) {
      const device = await this.devices.findById(deviceId);
      if (!device || !device.isActive || device.siteId !== this.options.siteId) {
        return null;
      }
    }
    return user;
  }

  private async finishLogin(
    user: StoredUser,
    secretHash: string | null,
    presented: string,
    deviceToken: string | null,
  ): Promise<SessionGrant | AuthFailure> {
    const now = this.clock.now();
    if (user.lockedUntil && user.lockedUntil > now) {
      await this.auditLock(user, null);
      return lockedResult(user.lockedUntil, now);
    }
    const secretOk = secretHash !== null && (await this.hasher.verify(secretHash, presented));
    if (!secretOk) {
      return this.recordFailure(user, now);
    }
    const device = deviceToken === null ? null : await this.findPresentedDevice(deviceToken);
    if (deviceToken !== null && !device) {
      await this.auditFailure(user.id, null, "device");
      return { ok: false, code: "DEVICE_NOT_ALLOWED" };
    }
    const decision = canLogin(toLoginUser(user), device);
    if (!decision.ok) {
      await this.auditFailure(user.id, device?.id ?? null, "device");
      return {
        ok: false,
        code:
          decision.reason === "INACTIVE_USER" || decision.reason === "PASSWORD_REQUIRED"
            ? "AUTH_INVALID"
            : "DEVICE_NOT_ALLOWED",
      };
    }
    await this.users.resetLoginFailures(user.id);
    if (device) {
      await this.devices.touch(device.id);
    }
    await this.audit.record({
      siteId: this.options.siteId,
      actorUserId: user.id,
      deviceId: device?.id ?? null,
      action: "auth.login.succeeded",
      entityType: "user",
      entityId: user.id,
      before: null,
      after: { role: user.role },
    });
    return {
      ok: true,
      userId: user.id,
      role: user.role,
      siteId: user.siteId,
      deviceId: device?.id ?? null,
      expiresInSeconds:
        user.role === "ADMIN"
          ? this.options.adminSessionSeconds
          : this.options.waiterSessionSeconds,
    };
  }

  private async recordFailure(user: StoredUser, now: Date): Promise<AuthFailure> {
    const expired = user.lockedUntil !== null && user.lockedUntil <= now;
    const failedAttempts = (expired ? 0 : user.failedAttempts) + 1;
    const lockedUntil =
      failedAttempts >= this.options.lockoutAttempts
        ? new Date(now.getTime() + this.options.lockoutSeconds * 1000)
        : null;
    await this.users.setLoginFailure(user.id, failedAttempts, lockedUntil);
    if (lockedUntil) {
      await this.auditLock(user, lockedUntil);
      return lockedResult(lockedUntil, now);
    }
    await this.auditFailure(user.id, null, "user");
    return { ok: false, code: "AUTH_INVALID" };
  }

  private findPresentedDevice(token: string): Promise<StoredDevice | null> {
    return this.devices.findByTokenHash(this.options.siteId, this.hashToken(token));
  }

  private auditFailure(
    actorUserId: string | null,
    deviceId: string | null,
    entityType: string,
  ): Promise<void> {
    return this.audit.record({
      siteId: this.options.siteId,
      actorUserId,
      deviceId,
      action: "auth.login.failed",
      entityType,
      entityId: actorUserId,
      before: null,
      after: null,
    });
  }

  private auditLock(user: StoredUser, lockedUntil: Date | null): Promise<void> {
    return this.audit.record({
      siteId: this.options.siteId,
      actorUserId: user.id,
      deviceId: null,
      action: "auth.login.locked",
      entityType: "user",
      entityId: user.id,
      before: null,
      after: { lockedUntil: (lockedUntil ?? user.lockedUntil)?.toISOString() ?? null },
    });
  }
}

function toLoginUser(user: StoredUser) {
  return {
    role: user.role,
    isActive: user.isActive,
    hasPassword: user.passwordHash !== null,
  };
}

function lockedResult(lockedUntil: Date, now: Date): AuthFailure {
  return {
    ok: false,
    code: "AUTH_LOCKED",
    retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000)),
  };
}
