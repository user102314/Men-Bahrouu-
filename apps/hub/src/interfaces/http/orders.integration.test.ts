import { newId, type PublicOrder } from "@resto/shared";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";

import type { AppConfig } from "../../config/env.js";
import { hashSecret } from "../../infrastructure/auth/argon2-hasher.js";
import { hashDeviceToken } from "../../infrastructure/auth/device-token.js";
import {
  databaseUrlFor,
  loadRootEnv,
  prepareTestDatabase,
} from "../../infrastructure/db/prepare-test-database.js";
import { buildApp } from "./app.js";

const siteId = "0199c0a0-0000-7000-8000-000000000001";
const adminId = "0199c0a0-0000-7000-8000-00000000c001";
const cashierId = "0199c0a0-0000-7000-8000-00000000c002";
const waiterId = "0199c0a0-0000-7000-8000-00000000c003";
const otherWaiterId = "0199c0a0-0000-7000-8000-00000000c004";
const tabletId = "0199c0a0-0000-7000-8000-00000000c005";
const cashierPcId = "0199c0a0-0000-7000-8000-00000000c006";
const barPrinterId = "0199c0a0-0000-7000-8000-00000000c007";
const kitchenPrinterId = "0199c0a0-0000-7000-8000-00000000c008";
const barStationId = "0199c0a0-0000-7000-8000-00000000c009";
const kitchenStationId = "0199c0a0-0000-7000-8000-00000000c00a";
const drinksId = "0199c0a0-0000-7000-8000-00000000c00b";
const mainsId = "0199c0a0-0000-7000-8000-00000000c00c";
const coffeeId = "0199c0a0-0000-7000-8000-00000000c00d";
const couscousId = "0199c0a0-0000-7000-8000-00000000c00e";
const unavailableId = "0199c0a0-0000-7000-8000-00000000c00f";
const tableId = "0199c0a0-0000-7000-8000-00000000c010";
const tabletToken = "tablet-order-token-0123456789abcd";
const cashierToken = "cashier-order-token-0123456789ab";
const waiterPin = "1234";
const cashierPin = "4321";
const adminPassword = "Admin#2026dev";

const config: AppConfig = {
  databaseUrl: "postgres://resto:resto@127.0.0.1:5432/resto_test",
  jwtSecret: "test-jwt-secret-with-at-least-32-chars",
  port: 0,
  siteId,
  corsOrigins: ["http://localhost:5173"],
  waiterSessionSeconds: 12 * 60 * 60,
  adminSessionSeconds: 2 * 60 * 60,
  lockoutAttempts: 5,
  lockoutSeconds: 300,
  businessDayCutoffHour: 5,
  printColumns: 48,
  printConnectTimeoutMs: 2000,
  printWriteTimeoutMs: 2000,
  printMaxAttempts: 5,
  nodeEnv: "test",
  version: "test",
};

let sql: postgres.Sql;
let app: Awaited<ReturnType<typeof buildApp>>;
let port = 0;
let waiterJwt = "";
let otherJwt = "";
let cashierJwt = "";
let waiterHash = "";
let cashierHash = "";
let adminHash = "";

beforeAll(async () => {
  loadRootEnv();
  await prepareTestDatabase();
  [waiterHash, cashierHash, adminHash] = await Promise.all([
    hashSecret(waiterPin),
    hashSecret(cashierPin),
    hashSecret(adminPassword),
  ]);
  sql = postgres(databaseUrlFor("resto_test"), { max: 20 });
  app = await buildApp({
    sql,
    config,
    clock: { now: () => new Date("2026-10-10T12:00:00.000Z") },
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  port = address.port;
  await clearTables();
  await reset(waiterHash, cashierHash, adminHash);
  waiterJwt = (await login(waiterId, waiterPin, tabletToken)).token;
  otherJwt = (await login(otherWaiterId, waiterPin, tabletToken)).token;
  cashierJwt = (await login(cashierId, cashierPin, cashierToken)).token;
});

afterAll(async () => {
  await app.close();
  await sql.end();
});

beforeEach(async () => {
  await clearTables();
  await reset(waiterHash, cashierHash, adminHash);
});

describe("orders", () => {
  it("returns the same order on a repeated create and rejects another server", async () => {
    const id = newId();
    const first = await create(waiterJwt, id);
    expect(first.statusCode).toBe(201);
    const second = await create(waiterJwt, id);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(id);
    const rows = await sql<
      { count: number }[]
    >`select count(*)::int as count from orders where id = ${id}`;
    expect(rows[0]?.count).toBe(1);
    const conflict = await create(otherJwt, id);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("ORDER_ID_CONFLICT");
  });

  it("prices the line from the catalog and rejects an unavailable product", async () => {
    const rejected = await app.inject({
      method: "POST",
      url: "/orders",
      headers: bearer(waiterJwt),
      payload: {
        id: newId(),
        items: [{ productId: coffeeId, quantity: 2, priceMillimes: 1 }],
      },
    });
    expect(rejected.statusCode).toBe(400);
    const created = await create(waiterJwt, newId(), [
      { productId: coffeeId, quantity: 2 },
      { productId: couscousId, quantity: 1 },
    ]);
    expect(created.statusCode).toBe(201);
    const body = created.json() as PublicOrder;
    expect(body.items.map((item) => item.unitPriceMillimes)).toEqual([2000, 28000]);
    expect(body.totalMillimes).toBe(32000);
    const missing = await create(waiterJwt, newId(), [{ productId: unavailableId, quantity: 1 }]);
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.code).toBe("PRODUCT_UNAVAILABLE");
  });

  it("hides another waiter's order and blocks changes to a sent line", async () => {
    const created = await create(
      waiterJwt,
      newId(),
      [{ productId: coffeeId, quantity: 1 }],
      tableId,
    );
    const order = created.json() as PublicOrder;
    const hidden = await app.inject({
      method: "GET",
      url: `/orders/${order.id}`,
      headers: bearer(otherJwt),
    });
    expect(hidden.statusCode).toBe(404);
    const sent = await app.inject({
      method: "POST",
      url: `/orders/${order.id}/send`,
      headers: bearer(waiterJwt),
    });
    expect(sent.statusCode).toBe(200);
    const itemId = order.items[0]?.id;
    const removed = await app.inject({
      method: "DELETE",
      url: `/orders/${order.id}/items/${itemId}`,
      headers: bearer(waiterJwt),
    });
    expect(removed.statusCode).toBe(409);
    expect(removed.json().error.code).toBe("LINE_ALREADY_SENT");
    const decision = await app.inject({
      method: "POST",
      url: `/cancellation-requests/${newId()}/decision`,
      headers: bearer(waiterJwt),
      payload: { approve: false },
    });
    expect(decision.statusCode).toBe(403);
    expect(decision.json().error.code).toBe("FORBIDDEN");
  });

  it("requires an admin override before a cashier can approve a cancellation", async () => {
    const created = await create(
      waiterJwt,
      newId(),
      [{ productId: coffeeId, quantity: 1 }],
      tableId,
    );
    const order = created.json() as PublicOrder;
    await app.inject({
      method: "POST",
      url: `/orders/${order.id}/send`,
      headers: bearer(waiterJwt),
    });
    const itemId = order.items[0]?.id ?? "";
    const request = await app.inject({
      method: "POST",
      url: `/orders/${order.id}/cancellation-requests`,
      headers: bearer(waiterJwt),
      payload: { orderItemId: itemId, reason: "Client a changé d'avis" },
    });
    expect(request.statusCode).toBe(201);
    const cancellationId = request.json().cancellationId as string;
    const missing = await decide(cancellationId, { approve: true });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error.code).toBe("OVERRIDE_REQUIRED");
    const wrong = await decide(cancellationId, {
      approve: true,
      adminOverride: { email: "admin@resto.local", password: "Wrong#password" },
    });
    expect(wrong.statusCode).toBe(401);
    const attempts = await sql<{ failed_attempts: number }[]>`
      select failed_attempts from users where id = ${adminId}
    `;
    expect(attempts[0]?.failed_attempts).toBe(1);
    const approved = await decide(cancellationId, {
      approve: true,
      adminOverride: { email: "admin@resto.local", password: adminPassword },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe("CANCELLED");
    const table = await sql<
      { status: string }[]
    >`select status from floor_tables where id = ${tableId}`;
    expect(table[0]?.status).toBe("FREE");
    const audit = await sql<
      { actor_user_id: string; after: { decidedBy?: string; overrideBy?: string } }[]
    >`
      select actor_user_id, after from audit_log where action = 'cancellation.decided'
    `;
    expect(audit[0]?.actor_user_id).toBe(cashierId);
    expect(audit[0]?.after.overrideBy).toBe(adminId);
    expect(audit[0]?.after.decidedBy).toBe(cashierId);
  });

  it("refuses a second open order on the same table", async () => {
    const first = await create(waiterJwt, newId(), [{ productId: coffeeId, quantity: 1 }], tableId);
    await app.inject({
      method: "POST",
      url: `/orders/${first.json().id}/send`,
      headers: bearer(waiterJwt),
    });
    const tables = await app.inject({ method: "GET", url: "/tables", headers: bearer(waiterJwt) });
    expect(tables.json().tables[0].status).toBe("OCCUPIED");
    const second = await create(
      waiterJwt,
      newId(),
      [{ productId: couscousId, quantity: 1 }],
      tableId,
    );
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("TABLE_BUSY");
  });

  it("prints one ticket set when the same order is sent twice at once", async () => {
    const created = await create(waiterJwt, newId(), [
      { productId: coffeeId, quantity: 1 },
      { productId: couscousId, quantity: 1 },
    ]);
    const orderId = created.json().id as string;
    const [left, right] = await Promise.all([
      app.inject({ method: "POST", url: `/orders/${orderId}/send`, headers: bearer(waiterJwt) }),
      app.inject({ method: "POST", url: `/orders/${orderId}/send`, headers: bearer(waiterJwt) }),
    ]);
    expect([left.statusCode, right.statusCode].sort()).toEqual([200, 200]);
    const jobs = await sql<
      { type: string; payload: { stationKind: string; lines: { nameFr: string }[] } }[]
    >`
      select type, payload from print_jobs where order_id = ${orderId}
    `;
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.type)).toEqual(["NEW", "NEW"]);
    const byStation = Object.fromEntries(
      jobs.map((job) => [job.payload.stationKind, job.payload.lines.map((line) => line.nameFr)]),
    );
    expect(byStation.BAR).toEqual(["Café express"]);
    expect(byStation.KITCHEN).toEqual(["Couscous au poisson"]);
  });

  it("rejects an illegal transition and allocates distinct daily numbers", async () => {
    const created = await create(waiterJwt, newId(), [{ productId: coffeeId, quantity: 1 }]);
    const served = await app.inject({
      method: "POST",
      url: `/orders/${created.json().id}/served`,
      headers: bearer(waiterJwt),
    });
    expect(served.statusCode).toBe(409);
    expect(served.json().error.code).toBe("INVALID_TRANSITION");
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        create(waiterJwt, newId(), [{ productId: coffeeId, quantity: 1 }]),
      ),
    );
    expect(responses.every((response) => response.statusCode === 201)).toBe(true);
    const numbers = await sql<{ daily_number: number }[]>`
      select daily_number from orders order by daily_number
    `;
    expect(numbers.map((row) => row.daily_number)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1),
    );
  });

  it("asks for the bill and marks the table to pay", async () => {
    const created = await create(waiterJwt, newId(), [{ productId: coffeeId, quantity: 1 }], tableId);
    const order = created.json() as PublicOrder;
    await app.inject({ method: "POST", url: `/orders/${order.id}/send`, headers: bearer(waiterJwt) });
    const bill = await app.inject({
      method: "POST",
      url: `/orders/${order.id}/request-bill`,
      headers: bearer(waiterJwt),
    });
    expect(bill.statusCode).toBe(200);
    const table = await sql<{ status: string }[]>`select status from floor_tables where id = ${tableId}`;
    expect(table[0]?.status).toBe("TO_PAY");
  });

  it("keeps a waiter's socket limited to that waiter's orders", async () => {
    const denied = connect("");
    await new Promise<void>((resolve, reject) => {
      denied.on("connect_error", () => resolve());
      denied.on("connect", () => reject(new Error("socket connected without a token")));
    });
    denied.close();
    const cashierSocket = connect(cashierJwt);
    const otherSocket = connect(otherJwt);
    await Promise.all([connected(cashierSocket), connected(otherSocket)]);
    const cashierSaw = waitFor<{ order: { id: string } }>(cashierSocket, "order.sent");
    let leaked = false;
    otherSocket.on("order.sent", () => {
      leaked = true;
    });
    const created = await create(waiterJwt, newId(), [{ productId: coffeeId, quantity: 1 }]);
    await app.inject({
      method: "POST",
      url: `/orders/${created.json().id}/send`,
      headers: bearer(waiterJwt),
    });
    await expect(cashierSaw).resolves.toMatchObject({ order: { id: created.json().id } });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(leaked).toBe(false);
    cashierSocket.close();
    otherSocket.close();
  });
});

async function clearTables() {
  await sql`
    truncate table audit_log, sync_outbox, print_jobs, cancellation_requests, order_items, orders,
      order_counters, floor_tables, products, categories, stations, printers, devices, users, sites
    restart identity cascade
  `;
}

async function reset(waiterHash: string, cashierHash: string, adminHash: string) {
  await sql`insert into sites (id, name, address) values (${siteId}, 'Test', 'Tunis')`;
  await sql`
    insert into users (id, site_id, display_name, role, email, password_hash)
    values (${adminId}, ${siteId}, 'Karim', 'ADMIN', 'admin@resto.local', ${adminHash})
  `;
  await sql`
    insert into users (id, site_id, display_name, role, pin_hash) values
      (${cashierId}, ${siteId}, 'Sonia', 'CASHIER', ${cashierHash}),
      (${waiterId}, ${siteId}, 'Mohamed', 'WAITER', ${waiterHash}),
      (${otherWaiterId}, ${siteId}, 'Amira', 'WAITER', ${waiterHash})
  `;
  await sql`
    insert into devices (id, site_id, name, type, token_hash) values
      (${tabletId}, ${siteId}, 'Tablette', 'TABLET', ${hashDeviceToken(tabletToken)}),
      (${cashierPcId}, ${siteId}, 'Caisse', 'CASHIER_PC', ${hashDeviceToken(cashierToken)})
  `;
  await sql`
    insert into printers (id, site_id, name, host, port) values
      (${barPrinterId}, ${siteId}, 'Bar', '127.0.0.1', 9101),
      (${kitchenPrinterId}, ${siteId}, 'Cuisine', '127.0.0.1', 9102)
  `;
  await sql`
    insert into stations (id, site_id, kind, name, printer_id) values
      (${barStationId}, ${siteId}, 'BAR', 'Bar', ${barPrinterId}),
      (${kitchenStationId}, ${siteId}, 'KITCHEN', 'Cuisine', ${kitchenPrinterId})
  `;
  await sql`
    insert into categories (id, site_id, name_fr, name_ar, station_id, sort_order) values
      (${drinksId}, ${siteId}, 'Boissons chaudes', 'مشروبات', ${barStationId}, 1),
      (${mainsId}, ${siteId}, 'Plats', 'أطباق', ${kitchenStationId}, 2)
  `;
  await sql`
    insert into products (id, site_id, category_id, name_fr, name_ar, price_millimes, vat_rate_bp, is_available) values
      (${coffeeId}, ${siteId}, ${drinksId}, 'Café express', 'قهوة', 2000, 700, true),
      (${couscousId}, ${siteId}, ${mainsId}, 'Couscous au poisson', 'كسكسي', 28000, 700, true),
      (${unavailableId}, ${siteId}, ${drinksId}, 'Citronnade', 'ليمون', 6000, 700, false)
  `;
  await sql`
    insert into floor_tables (id, site_id, label, zone, seats) values (${tableId}, ${siteId}, 'T3', 'Salle', 4)
  `;
}

function create(
  token: string,
  id: string,
  items: { productId: string; quantity: number }[] = [{ productId: coffeeId, quantity: 1 }],
  openTable?: string,
) {
  return app.inject({
    method: "POST",
    url: "/orders",
    headers: bearer(token),
    payload: { id, ...(openTable ? { tableId: openTable } : {}), items },
  });
}

function decide(
  id: string,
  payload: { approve: boolean; adminOverride?: { email: string; password: string } },
) {
  return app.inject({
    method: "POST",
    url: `/cancellation-requests/${id}/decision`,
    headers: bearer(cashierJwt),
    payload,
  });
}

async function login(userId: string, pin: string, deviceToken: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login-pin",
    headers: { "x-device-token": deviceToken },
    payload: { userId, pin },
  });
  if (response.statusCode !== 200) {
    throw new Error(`login failed: ${response.body}`);
  }
  return response.json() as { token: string };
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function connect(token: string): Socket {
  return io(`http://127.0.0.1:${port}`, {
    auth: token ? { token } : {},
    transports: ["websocket"],
    reconnection: false,
  });
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", (error) => reject(error));
  });
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 4000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
