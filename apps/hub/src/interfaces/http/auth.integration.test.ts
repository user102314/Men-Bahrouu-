import { SEED_IDS } from "../../infrastructure/db/seed-ids.js";
import { hashSecret } from "../../infrastructure/auth/argon2-hasher.js";
import { hashDeviceToken } from "../../infrastructure/auth/device-token.js";
import {
  databaseUrlFor,
  loadRootEnv,
  prepareTestDatabase,
} from "../../infrastructure/db/prepare-test-database.js";
import type { AppConfig } from "../../config/env.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";

import { buildApp } from "./app.js";

const siteId = SEED_IDS.site;
const adminId = "0199c0a0-0000-7000-8000-00000000b001";
const waiterId = "0199c0a0-0000-7000-8000-00000000b002";
const tabletId = "0199c0a0-0000-7000-8000-00000000b003";
const phoneId = "0199c0a0-0000-7000-8000-00000000b004";
const tabletToken = "tablet-token-test-0123456789abcdef";
const phoneToken = "phone-token-test-0123456789abcdef0";
const waiterPin = "1234";
const adminPassword = "Admin#2026dev";

const logs: string[] = [];
let current = new Date("2026-10-10T08:00:00.000Z");
let sql: postgres.Sql;
let app: Awaited<ReturnType<typeof buildApp>>;

const config: AppConfig = {
  databaseUrl: "postgres://resto:resto@127.0.0.1:5432/resto_test",
  jwtSecret: "test-jwt-secret-with-at-least-32-chars",
  port: 3000,
  siteId,
  corsOrigins: ["http://localhost:5173"],
  waiterSessionSeconds: 12 * 60 * 60,
  adminSessionSeconds: 2 * 60 * 60,
  lockoutAttempts: 5,
  lockoutSeconds: 300,
  businessDayCutoffHour: 5,
  nodeEnv: "test",
  version: "test",
};

beforeAll(async () => {
  loadRootEnv();
  await prepareTestDatabase();
  sql = postgres(databaseUrlFor("resto_test"), { max: 10 });
  app = await buildApp({
    sql,
    config,
    clock: { now: () => current },
    logger: {
      level: "info",
      stream: { write: (message: string) => logs.push(message) },
    },
  });
});

afterAll(async () => {
  await app.close();
  await sql.end();
});

beforeEach(async () => {
  current = new Date("2026-10-10T08:00:00.000Z");
  logs.length = 0;
  await sql`
    truncate table audit_log, sync_outbox, print_jobs, cancellation_requests, order_items, orders,
      order_counters, floor_tables, products, categories, stations, printers, devices, users, sites
    restart identity cascade
  `;
  const [pinHash, passwordHash] = await Promise.all([
    hashSecret(waiterPin),
    hashSecret(adminPassword),
  ]);
  await sql`insert into sites (id, name, address) values (${siteId}, 'Test', 'Tunis')`;
  await sql`
    insert into users (id, site_id, display_name, role, email, password_hash)
    values (${adminId}, ${siteId}, 'Karim', 'ADMIN', 'admin@resto.local', ${passwordHash})
  `;
  await sql`
    insert into users (id, site_id, display_name, role, pin_hash)
    values (${waiterId}, ${siteId}, 'Mohamed', 'WAITER', ${pinHash})
  `;
  await sql`
    insert into devices (id, site_id, name, type, token_hash)
    values
      (${tabletId}, ${siteId}, 'Tablette', 'TABLET', ${hashDeviceToken(tabletToken)}),
      (${phoneId}, ${siteId}, 'Telephone', 'PHONE', ${hashDeviceToken(phoneToken)})
  `;
});

describe("authentication", () => {
  it("refuses a waiter on a phone and accepts an admin", async () => {
    const waiter = await loginPin(waiterPin, phoneToken);
    expect(waiter.statusCode).toBe(403);
    expect(waiter.json().error.code).toBe("DEVICE_NOT_ALLOWED");

    const admin = await loginAdmin(phoneToken);
    expect(admin.statusCode).toBe(200);
    expect(admin.json().token).toEqual(expect.any(String));
  });

  it("refuses a waiter without a device token", async () => {
    const response = await loginPin(waiterPin, null);
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("DEVICE_NOT_ALLOWED");
  });

  it("rejects a revoked device and invalidates an existing token", async () => {
    const login = await loginPin(waiterPin, tabletToken);
    expect(login.statusCode).toBe(200);
    const token = login.json().token as string;
    const admin = await loginAdmin(null);
    const revoke = await app.inject({
      method: "POST",
      url: `/devices/${tabletId}/revoke`,
      headers: { authorization: `Bearer ${admin.json().token as string}` },
    });
    expect(revoke.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(401);
    const again = await loginPin(waiterPin, tabletToken);
    expect(again.statusCode).toBe(403);
    expect(again.json().error.code).toBe("DEVICE_NOT_ALLOWED");
  });

  it("locks the account after five bad pins and unlocks after expiry", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await loginPin("0000", tabletToken);
      expect(response.json().error.code).toBe(attempt === 4 ? "AUTH_LOCKED" : "AUTH_INVALID");
    }
    const duringLock = await loginPin(waiterPin, tabletToken);
    expect(duringLock.statusCode).toBe(401);
    expect(duringLock.json().error.code).toBe("AUTH_LOCKED");
    expect(duringLock.json().error.details.retryAfterSeconds).toBeGreaterThan(0);

    current = new Date(current.getTime() + 301_000);
    const after = await loginPin(waiterPin, tabletToken);
    expect(after.statusCode).toBe(200);
  });

  it("hides admin routes from a waiter and allows an admin", async () => {
    const waiter = await loginPin(waiterPin, tabletToken);
    const forbidden = await app.inject({
      method: "GET",
      url: "/devices",
      headers: { authorization: `Bearer ${waiter.json().token as string}` },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe("FORBIDDEN");

    const admin = await loginAdmin(null);
    const allowed = await app.inject({
      method: "GET",
      url: "/devices",
      headers: { authorization: `Bearer ${admin.json().token as string}` },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tabletId, type: "TABLET" })]),
    );
  });

  it("allows device and authorization headers for the configured origin", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/auth/login-pin",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,authorization,x-device-token",
      },
    });
    expect(response.statusCode).toBe(204);
    const allowed = String(response.headers["access-control-allow-headers"]).toLowerCase();
    expect(allowed).toContain("authorization");
    expect(allowed).toContain("x-device-token");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("locks exactly once when ten wrong pins arrive together", async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => loginPin("0000", tabletToken)),
    );
    const locked = responses.filter((response) => response.json().error.code === "AUTH_LOCKED");
    expect(locked.length).toBeGreaterThan(0);
    const rows = await sql<{ failed_attempts: number; locked_until: Date | null }[]>`
      select failed_attempts, locked_until from users where id = ${waiterId}
    `;
    expect(rows[0]?.failed_attempts).toBe(10);
    expect(rows[0]?.locked_until).not.toBeNull();
  });

  it("requires a device token to list profiles", async () => {
    const missing = await app.inject({ method: "GET", url: "/auth/profiles" });
    expect(missing.statusCode).toBe(401);
    const listed = await app.inject({
      method: "GET",
      url: "/auth/profiles",
      headers: { "x-device-token": tabletToken },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().profiles).toEqual([
      { id: waiterId, displayName: "Mohamed", role: "WAITER" },
    ]);
  });

  it("never returns secret hashes and redacts secrets from logs", async () => {
    const secretPin = "909090";
    const secretPassword = "Unique#Pass99";
    const pinResponse = await loginPin(secretPin, tabletToken);
    const adminResponse = await app.inject({
      method: "POST",
      url: "/auth/login-admin",
      payload: { email: "admin@resto.local", password: secretPassword },
    });
    const waiter = await loginPin(waiterPin, tabletToken);
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${waiter.json().token as string}` },
    });
    const admin = await loginAdmin(null);
    const devices = await app.inject({
      method: "GET",
      url: "/devices",
      headers: { authorization: `Bearer ${admin.json().token as string}` },
    });
    const profiles = await app.inject({
      method: "GET",
      url: "/auth/profiles",
      headers: { "x-device-token": tabletToken },
    });
    const bodies = [pinResponse, adminResponse, me, devices, profiles]
      .map((response) => response.body)
      .join("\n");
    expect(bodies).not.toMatch(/pin_hash|password_hash|token_hash/);
    const written = logs.join("\n");
    expect(written).not.toContain(secretPin);
    expect(written).not.toContain(secretPassword);
    expect(written).toContain("[Redacted]");
  });

  it("writes the expected audit events and answers health", async () => {
    await loginPin("0000", tabletToken);
    const waiter = await loginPin(waiterPin, tabletToken);
    await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${waiter.json().token as string}` },
    });
    const admin = await loginAdmin(null);
    const created = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${admin.json().token as string}` },
      payload: { name: "Nouvelle tablette", type: "TABLET" },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as { id: string; token: string };
    expect(createdBody.token).toEqual(expect.any(String));
    await app.inject({
      method: "POST",
      url: `/devices/${createdBody.id}/revoke`,
      headers: { authorization: `Bearer ${admin.json().token as string}` },
    });

    const rows = await sql<{ action: string }[]>`select action from audit_log`;
    const actions = rows.map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "auth.login.failed",
        "auth.login.succeeded",
        "auth.logout",
        "device.registered",
        "device.revoked",
      ]),
    );

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok", db: "ok", version: "test" });
  });
});

function loginPin(pin: string, deviceToken: string | null) {
  return app.inject({
    method: "POST",
    url: "/auth/login-pin",
    headers: deviceToken ? { "x-device-token": deviceToken } : {},
    payload: { userId: waiterId, pin },
  });
}

function loginAdmin(deviceToken: string | null) {
  return app.inject({
    method: "POST",
    url: "/auth/login-admin",
    headers: deviceToken ? { "x-device-token": deviceToken } : {},
    payload: { email: "admin@resto.local", password: adminPassword },
  });
}
