import type { DeviceType, Role } from "@resto/shared";

export interface StoredUser {
  id: string;
  siteId: string;
  displayName: string;
  role: Role;
  email: string | null;
  passwordHash: string | null;
  pinHash: string | null;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface UserRepository {
  findById(id: string): Promise<StoredUser | null>;
  findByEmail(siteId: string, email: string): Promise<StoredUser | null>;
  listActiveStaff(siteId: string): Promise<StoredUser[]>;
  incrementLoginFailure(
    id: string,
    now: Date,
    lockoutAttempts: number,
    lockoutSeconds: number,
  ): Promise<{ failedAttempts: number; lockedUntil: Date | null }>;
  resetLoginFailures(id: string): Promise<void>;
}

export interface StoredDevice {
  id: string;
  siteId: string;
  name: string;
  type: DeviceType;
  isActive: boolean;
  lastSeenAt: string | null;
}

export interface DeviceRepository {
  findById(id: string): Promise<StoredDevice | null>;
  findByTokenHash(siteId: string, tokenHash: string): Promise<StoredDevice | null>;
  list(siteId: string): Promise<StoredDevice[]>;
  insert(device: {
    id: string;
    siteId: string;
    name: string;
    type: DeviceType;
    tokenHash: string;
  }): Promise<void>;
  revoke(id: string): Promise<StoredDevice | null>;
  touch(id: string): Promise<void>;
}

export interface AuditEntry {
  siteId: string;
  actorUserId: string | null;
  deviceId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
}

export interface AuditRepository {
  record(entry: AuditEntry): Promise<void>;
}

export interface SecretHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}
