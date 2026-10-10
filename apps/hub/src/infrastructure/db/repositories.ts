import { newId, type DeviceType, type Role } from "@resto/shared";
import type postgres from "postgres";

import type {
  AuditEntry,
  AuditRepository,
  DeviceRepository,
  StoredDevice,
  StoredUser,
  UserRepository,
} from "../../application/ports.js";

interface UserRow {
  id: string;
  site_id: string;
  display_name: string;
  role: Role;
  email: string | null;
  password_hash: string | null;
  pin_hash: string | null;
  is_active: boolean;
  failed_attempts: number;
  locked_until: Date | string | null;
}

interface DeviceRow {
  id: string;
  site_id: string;
  name: string;
  type: DeviceType;
  is_active: boolean;
}

export function createUserRepository(sql: postgres.Sql): UserRepository {
  return {
    async findById(id) {
      const rows = await sql<UserRow[]>`
        select id, site_id, display_name, role, email, password_hash, pin_hash, is_active, failed_attempts, locked_until
        from users where id = ${id}
      `;
      return mapUser(rows[0]);
    },
    async findByEmail(siteId, email) {
      const rows = await sql<UserRow[]>`
        select id, site_id, display_name, role, email, password_hash, pin_hash, is_active, failed_attempts, locked_until
        from users where site_id = ${siteId} and lower(email) = ${email.toLowerCase()}
      `;
      return mapUser(rows[0]);
    },
    async listActiveStaff(siteId) {
      const rows = await sql<UserRow[]>`
        select id, site_id, display_name, role, email, password_hash, pin_hash, is_active, failed_attempts, locked_until
        from users
        where site_id = ${siteId} and is_active = true and role in ('WAITER', 'CASHIER')
        order by display_name
      `;
      return rows.flatMap((row) => {
        const user = mapUser(row);
        return user ? [user] : [];
      });
    },
    async setLoginFailure(id, failedAttempts, lockedUntil) {
      await sql`
        update users
        set failed_attempts = ${failedAttempts}, locked_until = ${lockedUntil}, updated_at = now()
        where id = ${id}
      `;
    },
    async resetLoginFailures(id) {
      await sql`
        update users
        set failed_attempts = 0, locked_until = null, updated_at = now()
        where id = ${id}
      `;
    },
  };
}

export function createDeviceRepository(sql: postgres.Sql): DeviceRepository {
  return {
    async findById(id) {
      const rows = await sql<DeviceRow[]>`
        select id, site_id, name, type, is_active from devices where id = ${id}
      `;
      return mapDevice(rows[0]);
    },
    async findByTokenHash(siteId, tokenHash) {
      const rows = await sql<DeviceRow[]>`
        select id, site_id, name, type, is_active
        from devices where site_id = ${siteId} and token_hash = ${tokenHash}
      `;
      return mapDevice(rows[0]);
    },
    async list(siteId) {
      const rows = await sql<DeviceRow[]>`
        select id, site_id, name, type, is_active from devices where site_id = ${siteId} order by name
      `;
      return rows.flatMap((row) => {
        const device = mapDevice(row);
        return device ? [device] : [];
      });
    },
    async insert(device) {
      await sql`
        insert into devices (id, site_id, name, type, token_hash)
        values (${device.id}, ${device.siteId}, ${device.name}, ${device.type}::device_type, ${device.tokenHash})
      `;
    },
    async revoke(id) {
      const rows = await sql<DeviceRow[]>`
        update devices set is_active = false, updated_at = now()
        where id = ${id}
        returning id, site_id, name, type, is_active
      `;
      return mapDevice(rows[0]);
    },
    async touch(id) {
      await sql`update devices set last_seen_at = now(), updated_at = now() where id = ${id}`;
    },
  };
}

export function createAuditRepository(sql: postgres.Sql): AuditRepository {
  return {
    async record(entry: AuditEntry) {
      await sql`
        insert into audit_log (
          id, site_id, actor_user_id, device_id, action, entity_type, entity_id, before, after
        ) values (
          ${newId()},
          ${entry.siteId},
          ${entry.actorUserId},
          ${entry.deviceId},
          ${entry.action},
          ${entry.entityType},
          ${entry.entityId},
          ${entry.before == null ? null : sql.json(entry.before as postgres.JSONValue)},
          ${entry.after == null ? null : sql.json(entry.after as postgres.JSONValue)}
        )
      `;
    },
  };
}

function mapUser(row: UserRow | undefined): StoredUser | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    siteId: row.site_id,
    displayName: row.display_name,
    role: row.role,
    email: row.email,
    passwordHash: row.password_hash,
    pinHash: row.pin_hash,
    isActive: row.is_active,
    failedAttempts: row.failed_attempts,
    lockedUntil: asDate(row.locked_until),
  };
}

function mapDevice(row: DeviceRow | undefined): StoredDevice | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    type: row.type,
    isActive: row.is_active,
  };
}

function asDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}
