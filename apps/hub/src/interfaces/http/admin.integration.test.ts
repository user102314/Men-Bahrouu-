import { newId, vatPortionFromGross, millimes } from "@resto/shared";
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
import { seedServiceHistory } from "../../infrastructure/db/seed-history.js";
import { buildApp } from "./app.js";

const siteId = "0199c0a0-0000-7000-8000-000000000001";
const otherSiteId = "0199c0a0-0000-7000-8000-0000000000ee";
const adminId = "0199c0a0-0000-7000-8000-00000000d001";
const cashierId = "0199c0a0-0000-7000-8000-00000000d002";
const waiterId = "0199c0a0-0000-7000-8000-00000000d003";
const tabletId = "0199c0a0-0000-7000-8000-00000000d005";
const cashierPcId = "0199c0a0-0000-7000-8000-00000000d006";
const barPrinterId = "0199c0a0-0000-7000-8000-00000000d007";
const kitchenPrinterId = "0199c0a0-0000-7000-8000-00000000d008";
const barStationId = "0199c0a0-0000-7000-8000-00000000d009";
const kitchenStationId = "0199c0a0-0000-7000-8000-00000000d00a";
const drinksId = "0199c0a0-0000-7000-8000-00000000d00b";
const mainsId = "0199c0a0-0000-7000-8000-00000000d00c";
const coffeeId = "0199c0a0-0000-7000-8000-00000000d00d";
const couscousId = "0199c0a0-0000-7000-8000-00000000d00e";
const brikId = "0199c0a0-0000-7000-8000-00000000d00f";
const tableId = "0199c0a0-0000-7000-8000-00000000d010";
const tabletToken = "tablet-admin-token-0123456789abcd";
const cashierToken = "cashier-admin-token-0123456789ab";
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
let adminJwt = "";
let cashierJwt = "";
let waiterJwt = "";
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
  app = await buildApp({ sql, config, clock: { now: () => new Date("2026-10-10T12:00:00.000Z") } });
  await app.listen({ port: 0, host: "127.0.0.1" });
  port = (app.server.address() as AddressInfo).port;
  await clearTables();
  await reset();
});

afterAll(async () => {
  await app.close();
  await sql.end();
});

beforeEach(async () => {
  await clearTables();
  await reset();
  adminJwt = tokenOf(await loginAdmin());
  cashierJwt = tokenOf(await loginPin(cashierId, cashierPin, cashierToken));
  waiterJwt = tokenOf(await loginPin(waiterId, waiterPin, tabletToken));
});

describe("admin permissions", () => {
  it("keeps the waiter out and limits the cashier to availability and the cash shift", async () => {
    const users = await call("GET", "/users", waiterJwt);
    expect(users.statusCode).toBe(403);
    const products = await call("POST", "/products", cashierJwt, {
      id: newId(),
      categoryId: drinksId,
      nameFr: "Nouveau",
      nameAr: "جديد",
      priceMillimes: 1000,
    });
    expect(products.statusCode).toBe(403);
    const reports = await call(
      "GET",
      "/reports/dashboard?from=2026-10-10&to=2026-10-10",
      cashierJwt,
    );
    expect(reports.statusCode).toBe(403);
    const availability = await call("PATCH", `/products/${coffeeId}/availability`, cashierJwt, {
      isAvailable: false,
    });
    expect(availability.statusCode).toBe(200);
    const shift = await call("POST", "/cash-shifts/open", cashierJwt, {
      id: newId(),
      openingFloatMillimes: 10_000,
    });
    expect(shift.statusCode).toBe(201);
    const listed = await call("GET", "/users", adminJwt);
    expect(listed.statusCode).toBe(200);
  });
});

describe("catalog prices and staff", () => {
  it("lists categories, stations, printers, and a recipe for the admin desk", async () => {
    const categories = await call("GET", "/admin/categories", adminJwt);
    expect(categories.statusCode).toBe(200);
    expect(
      (categories.json() as { categories: { id: string }[] }).categories.some(
        (row) => row.id === drinksId,
      ),
    ).toBe(true);
    const hidden = await call("PATCH", `/categories/${drinksId}`, adminJwt, { isActive: false });
    expect(hidden.statusCode).toBe(200);
    const stations = await call("GET", "/admin/stations", adminJwt);
    expect(stations.statusCode).toBe(200);
    expect(
      (stations.json() as { stations: { id: string }[] }).stations.some(
        (row) => row.id === barStationId,
      ),
    ).toBe(true);
    const printers = await call("GET", "/admin/printers", adminJwt);
    expect(
      (printers.json() as { printers: { id: string }[] }).printers.some(
        (row) => row.id === barPrinterId,
      ),
    ).toBe(true);
    const recipe = await call("GET", `/products/${coffeeId}/ingredients`, adminJwt);
    expect(recipe.statusCode).toBe(200);
    expect(Array.isArray((recipe.json() as { ingredients: unknown }).ingredients)).toBe(true);
    const waiter = await call("GET", "/admin/categories", waiterJwt);
    expect(waiter.statusCode).toBe(403);
    await call("PATCH", `/categories/${drinksId}`, adminJwt, { isActive: true });
  });

  it("audits a price change, leaves the sent order untouched, and demands confirmation at 1000 TND", async () => {
    const created = await call("POST", "/orders", waiterJwt, {
      id: newId(),
      items: [{ productId: coffeeId, quantity: 1 }],
    });
    const order = created.json() as { id: string; items: { unitPriceMillimes: number }[] };
    await call("POST", `/orders/${order.id}/send`, waiterJwt);
    const blocked = await call("PATCH", `/products/${coffeeId}`, adminJwt, {
      priceMillimes: 1_000_000,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error?.code).toBe("PRICE_CONFIRMATION");
    const changed = await call("PATCH", `/products/${coffeeId}`, adminJwt, {
      priceMillimes: 2_500,
    });
    expect(changed.statusCode).toBe(200);
    const audit = await sql<
      { before: { price_millimes: number }; after: { priceMillimes: number } }[]
    >`
      select before, after from audit_log where action = 'product.updated' and entity_id = ${coffeeId}
    `;
    expect(audit[0]?.before.price_millimes).toBe(2000);
    expect(audit[0]?.after.priceMillimes).toBe(2500);
    const line = await sql<{ unit_price_millimes: number }[]>`
      select unit_price_millimes from order_items where order_id = ${order.id}
    `;
    expect(line[0]?.unit_price_millimes).toBe(2000);
    expect(order.items[0]?.unitPriceMillimes).toBe(2000);
    await call("PATCH", `/categories/${drinksId}`, adminJwt, { stationId: kitchenStationId });
    const station = await sql<{ station_id: string }[]>`
      select station_id from order_items where order_id = ${order.id}
    `;
    expect(station[0]?.station_id).toBe(barStationId);
    const printer = await call("POST", "/printers", adminJwt, {
      id: newId(),
      name: "Publique",
      host: "8.8.8.8",
      port: 9100,
    });
    expect(printer.statusCode).toBe(422);
    expect(printer.json().error?.code).toBe("HOST_NOT_PRIVATE");
  });

  it("refuses to drop the last admin, returns a pin once, and clears the lock", async () => {
    const self = await call("POST", `/users/${adminId}/deactivate`, adminJwt);
    expect(self.statusCode).toBe(403);
    const demote = await call("PATCH", `/users/${adminId}/role`, adminJwt, { role: "CASHIER" });
    expect(demote.statusCode).toBe(409);
    expect(demote.json().error?.code).toBe("LAST_ADMIN");
    const secondId = newId();
    const created = await call("POST", "/users", adminJwt, {
      id: secondId,
      displayName: "Leila",
      role: "ADMIN",
      email: "leila@resto.local",
      password: "Admin#2026dev",
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().pin).toBeUndefined();
    expect(JSON.stringify(created.json())).not.toContain("hash");
    const removed = await call("POST", `/users/${secondId}/deactivate`, adminJwt);
    expect(removed.statusCode).toBe(200);

    await sql`update users set failed_attempts = 4, locked_until = now() + interval '5 minutes' where id = ${waiterId}`;
    const reset = await call("POST", `/users/${waiterId}/reset-pin`, adminJwt);
    expect(reset.statusCode).toBe(200);
    const pin = reset.json().pin as string;
    expect(pin).toMatch(/^\d{4}$/);
    const oldLogin = await loginPin(waiterId, waiterPin, tabletToken);
    expect(oldLogin.statusCode).toBe(401);
    const fresh = await loginPin(waiterId, pin, tabletToken);
    expect(fresh.statusCode).toBe(200);
    const lock = await sql<{ failed_attempts: number; locked_until: Date | null }[]>`
      select failed_attempts, locked_until from users where id = ${waiterId}
    `;
    expect(lock[0]?.failed_attempts).toBe(0);
    expect(lock[0]?.locked_until).toBeNull();
  });

  it("creates a floor pin, promotes with a password, and refuses a duplicate email", async () => {
    const id = newId();
    const created = await call("POST", "/users", adminJwt, {
      id,
      displayName: "Hatem",
      role: "WAITER",
    });
    expect(created.statusCode).toBe(201);
    const pin = created.json().pin as string;
    expect(pin).toMatch(/^\d{4}$/);
    const listed = await call("GET", "/users", adminJwt);
    const row = (listed.json().users as { id?: string; role?: string; has_pin?: boolean; has_password?: boolean }[]).find(
      (user) => user.id === id,
    );
    expect(row).toMatchObject({ role: "WAITER", has_pin: true, has_password: false });
    const blocked = await call("PATCH", `/users/${id}/role`, adminJwt, { role: "ADMIN" });
    expect(blocked.statusCode).toBe(409);
    const promoted = await call("PATCH", `/users/${id}/role`, adminJwt, {
      role: "ADMIN",
      email: "hatem@resto.local",
      password: "Service#2026",
    });
    expect(promoted.statusCode).toBe(200);
    expect(promoted.json().pin).toBeUndefined();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login-admin",
      payload: { email: "hatem@resto.local", password: "Service#2026" },
    });
    expect(login.statusCode).toBe(200);
    const duplicate = await call("POST", "/users", adminJwt, {
      id: newId(),
      displayName: "Autre",
      role: "ADMIN",
      email: "hatem@resto.local",
      password: "Service#2026",
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error?.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a second clock-in and a correction without a reason", async () => {
    const first = await call("POST", "/attendance/clock-in", waiterJwt);
    expect(first.statusCode).toBe(201);
    const second = await call("POST", "/attendance/clock-in", waiterJwt);
    expect(second.statusCode).toBe(409);
    expect(second.json().error?.code).toBe("OVERLAP");
    const missing = await call("PATCH", `/attendance/${first.json().id}`, adminJwt, {});
    expect(missing.statusCode).toBe(400);
    const corrected = await call("PATCH", `/attendance/${first.json().id}`, adminJwt, {
      clockOut: "2026-10-10T18:00:00.000Z",
      reason: "Oubli de sortie",
    });
    expect(corrected.statusCode).toBe(200);
  });
});

describe("stock and cash", () => {
  it("receives a purchase at the hand-checked average and reverses it on cancel", async () => {
    const supplierId = newId();
    const itemId = newId();
    await call("POST", "/suppliers", adminJwt, { id: supplierId, name: "Grossiste Tunis" });
    await call("POST", "/stock-items", adminJwt, {
      id: itemId,
      code: "SEM",
      nameFr: "Semoule",
      baseUnit: "G",
      minThresholdBase: 0,
    });
    const firstId = newId();
    await call("POST", "/purchases", adminJwt, {
      id: firstId,
      supplierId,
      purchaseDate: "2026-10-01",
      lines: [{ stockItemId: itemId, quantityBase: 2000, totalCostMillimes: 8000 }],
    });
    const first = await call("POST", `/purchases/${firstId}/receive`, adminJwt);
    expect(first.json().totalMillimes).toBe(8000);
    const secondId = newId();
    await call("POST", "/purchases", adminJwt, {
      id: secondId,
      supplierId,
      purchaseDate: "2026-10-02",
      lines: [{ stockItemId: itemId, quantityBase: 1000, totalCostMillimes: 5000 }],
    });
    await call("POST", `/purchases/${secondId}/receive`, adminJwt);
    const item = await sql<{ quantity_base: number; avg_cost_millimes_per_1000_base: number }[]>`
      select quantity_base, avg_cost_millimes_per_1000_base from stock_items where id = ${itemId}
    `;
    expect(item[0]).toEqual({ quantity_base: 3000, avg_cost_millimes_per_1000_base: 4333 });
    const locked = await call("PATCH", `/purchases/${secondId}`, adminJwt, { invoiceRef: "F-9" });
    expect(locked.statusCode).toBe(409);
    const cancelled = await call("POST", `/purchases/${secondId}/cancel`, adminJwt);
    expect(cancelled.statusCode).toBe(200);
    const after = await sql<{ quantity_base: number; avg_cost_millimes_per_1000_base: number }[]>`
      select quantity_base, avg_cost_millimes_per_1000_base from stock_items where id = ${itemId}
    `;
    expect(after[0]).toEqual({ quantity_base: 2000, avg_cost_millimes_per_1000_base: 4000 });
    const inventory = await call("POST", "/stock/inventories", adminJwt, {
      lines: [{ stockItemId: itemId, countedBase: 1500 }],
    });
    expect(inventory.statusCode).toBe(201);
    const lines = inventory.json().lines as { diffBase: number; diffValueMillimes: number }[];
    expect(lines[0]?.diffBase).toBe(-500);
    expect(lines[0]?.diffValueMillimes).toBe(-2000);
    const reasons = await sql<{ reason: string }[]>`
      select reason from stock_movements where stock_item_id = ${itemId} order by created_at
    `;
    expect(reasons.map((row) => row.reason)).toContain("PURCHASE_CANCEL");
  });

  it("consumes a recipe without blocking a short stock and alerts only once", async () => {
    const itemId = newId();
    await call("POST", "/stock-items", adminJwt, {
      id: itemId,
      code: "SEM",
      nameFr: "Semoule",
      baseUnit: "G",
      minThresholdBase: 100,
    });
    await sql`update stock_items set quantity_base = 150 where id = ${itemId}`;
    await call("PUT", `/products/${couscousId}/ingredients`, adminJwt, {
      ingredients: [{ stockItemId: itemId, quantityBase: 80 }],
    });
    const socket = connect(adminJwt);
    const lows: unknown[] = [];
    try {
      await connected(socket);
      socket.on("stock.low", (payload) => lows.push(payload));
      const first = await sendProduct(couscousId);
      expect(first.statusCode).toBe(200);
      const plain = await sendProduct(coffeeId);
      expect(plain.statusCode).toBe(200);
      const second = await sendProduct(couscousId);
      expect(second.statusCode).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(lows).toHaveLength(1);
      const qty = await sql<
        { quantity_base: number }[]
      >`select quantity_base from stock_items where id = ${itemId}`;
      expect(qty[0]?.quantity_base).toBe(-10);
      const coffeeMoves = await sql<{ count: number }[]>`
        select count(*)::int as count from stock_movements where ref_id = ${plain.json().id ?? ""}
      `;
      expect(coffeeMoves[0]?.count).toBe(0);
    } finally {
      socket.close();
    }
  });

  it("restocks a void only when the setting says so", async () => {
    const itemId = newId();
    await call("POST", "/stock-items", adminJwt, {
      id: itemId,
      code: "SEM",
      nameFr: "Semoule",
      baseUnit: "G",
      minThresholdBase: 0,
    });
    await sql`update stock_items set quantity_base = 500 where id = ${itemId}`;
    await call("PUT", `/products/${couscousId}/ingredients`, adminJwt, {
      ingredients: [{ stockItemId: itemId, quantityBase: 80 }],
    });
    await voidSent(couscousId);
    const kept = await sql<
      { quantity_base: number }[]
    >`select quantity_base from stock_items where id = ${itemId}`;
    expect(kept[0]?.quantity_base).toBe(420);
    await call("PUT", "/settings", adminJwt, { restockOnVoid: true });
    await voidSent(couscousId);
    const restored = await sql<
      { quantity_base: number }[]
    >`select quantity_base from stock_items where id = ${itemId}`;
    expect(restored[0]?.quantity_base).toBe(420);
  });

  it("computes the drawer and refuses a payment when a shift is required", async () => {
    const shiftId = newId();
    const opened = await call("POST", "/cash-shifts/open", cashierJwt, {
      id: shiftId,
      openingFloatMillimes: 10_000,
    });
    expect(opened.statusCode).toBe(201);
    const again = await call("POST", "/cash-shifts/open", cashierJwt, {
      id: newId(),
      openingFloatMillimes: 1,
    });
    expect(again.statusCode).toBe(409);
    const order = await sendProduct(coffeeId);
    const paid = await call("POST", `/orders/${order.json().id}/payments`, cashierJwt, {
      method: "CASH",
      tenderedMillimes: 3000,
    });
    expect(paid.statusCode).toBe(201);
    await call("POST", `/cash-shifts/${shiftId}/cash-movements`, cashierJwt, {
      type: "PAY_IN",
      amountMillimes: 500,
      reason: "Fond complémentaire",
    });
    await call("POST", `/cash-shifts/${shiftId}/cash-movements`, cashierJwt, {
      type: "PAY_OUT",
      amountMillimes: 300,
      reason: "Achat de glace",
    });
    const closed = await call("POST", `/cash-shifts/${shiftId}/close`, cashierJwt, {
      countedMillimes: 12_000,
    });
    expect(closed.json()).toEqual({ expectedMillimes: 12_200, varianceMillimes: -200 });
    const movement = await call("POST", `/cash-shifts/${shiftId}/cash-movements`, cashierJwt, {
      type: "PAY_OUT",
      amountMillimes: 100,
      reason: "Trop tard",
    });
    expect(movement.statusCode).toBe(409);
    const note = await call("PATCH", `/cash-shifts/${shiftId}`, cashierJwt, { note: "vu" });
    expect(note.statusCode).toBe(403);
    const noted = await call("PATCH", `/cash-shifts/${shiftId}`, adminJwt, { note: "contrôlé" });
    expect(noted.statusCode).toBe(200);

    await call("PUT", "/settings", adminJwt, { requireOpenShift: true });
    const unpaid = await sendProduct(coffeeId);
    const refused = await call("POST", `/orders/${unpaid.json().id}/payments`, cashierJwt, {
      method: "CARD",
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error?.code).toBe("SHIFT_REQUIRED");
  });

  it("rejects updates and deletes of stock movements", async () => {
    const itemId = newId();
    await call("POST", "/stock-items", adminJwt, {
      id: itemId,
      code: "HUI",
      nameFr: "Huile",
      baseUnit: "ML",
      minThresholdBase: 0,
    });
    await call("POST", "/stock-movements", adminJwt, {
      stockItemId: itemId,
      deltaBase: -10,
      reason: "WASTE",
      note: "Bouteille cassée",
    });
    await expect(
      sql`update stock_movements set note = 'non' where stock_item_id = ${itemId}`,
    ).rejects.toThrow(/append-only/);
    await expect(sql`delete from stock_movements where stock_item_id = ${itemId}`).rejects.toThrow(
      /append-only/,
    );
  });

  it("does not return another site", async () => {
    await sql`insert into sites (id, name, address) values (${otherSiteId}, 'Autre', 'Sfax')`;
    const foreign = newId();
    await sql`
      insert into stock_items (id, site_id, code, name_fr, base_unit, min_threshold_base)
      values (${foreign}, ${otherSiteId}, 'X', 'Secret', 'PIECE', 0)
    `;
    const listed = await call("GET", "/stock-items", adminJwt);
    expect(JSON.stringify(listed.json())).not.toContain(foreign);
    const hidden = await call("PATCH", `/stock-items/${foreign}`, adminJwt, { nameFr: "Non" });
    expect(hidden.statusCode).toBe(404);
  });
});

describe("management reports", () => {
  it("matches a hand-calculated day, the business-day cutoff, and the accountant CSV", async () => {
    await seedReportDay();
    const report = await call("GET", "/reports/dashboard?from=2026-10-10&to=2026-10-10", adminJwt);
    expect(report.json().notice).toContain("pas un document fiscal");
    expect(report.json().revenueMillimes).toBe(36_000);
    expect(report.json().orderCount).toBe(4);
    expect(report.json().averageBasketMillimes).toBe(9_000);
    expect(report.json().voidCount).toBe(1);
    expect(report.json().voidValueMillimes).toBe(4_500);
    const nextDay = await call("GET", "/reports/dashboard?from=2026-10-11&to=2026-10-11", adminJwt);
    expect(nextDay.json().revenueMillimes).toBe(0);
    const hours = await call(
      "GET",
      "/reports/sales/by-hour?from=2026-10-10&to=2026-10-10",
      adminJwt,
    );
    const byHour = new Map(
      (hours.json().points as { hour: number; revenue_millimes: number }[]).map((row) => [
        row.hour,
        row.revenue_millimes,
      ]),
    );
    expect(byHour.get(0)).toBe(1_500);
    expect(byHour.get(12)).toBe(2_000);
    expect(byHour.get(13)).toBe(4_500);
    const methods = await call("GET", "/reports/payments?from=2026-10-10&to=2026-10-10", adminJwt);
    const cash = (methods.json().methods as { method: string; amount_millimes: number }[]).find(
      (row) => row.method === "CASH",
    );
    const card = (methods.json().methods as { method: string; amount_millimes: number }[]).find(
      (row) => row.method === "CARD",
    );
    expect(cash?.amount_millimes).toBe(8_000);
    expect(card?.amount_millimes).toBe(28_000);
    const close = await call("GET", "/reports/daily-close?from=2026-10-10&to=2026-10-10", adminJwt);
    const vat =
      vatPortionFromGross(millimes(2000), 700) +
      vatPortionFromGross(millimes(28000), 700) +
      vatPortionFromGross(millimes(4500), 700) +
      vatPortionFromGross(millimes(1500), 700);
    expect(vat).toBe(2355);
    expect(close.json().vatMillimes).toBe(2355);
    const top = await call(
      "GET",
      "/reports/products/top?from=2026-10-10&to=2026-10-10&stationKind=KITCHEN",
      adminJwt,
    );
    const names = (top.json().products as { name: string; revenue_millimes: number }[]).map(
      (row) => row.name,
    );
    expect(names).toContain("Couscous au poisson");
    expect(names).not.toContain("Café express");
    const analysis = await call(
      "GET",
      "/reports/product-analysis?from=2026-10-10&to=2026-10-10",
      adminJwt,
    );
    expect(analysis.statusCode).toBe(200);
    const analysed = analysis.json().products as {
      name?: string;
      kind?: string;
      soldQuantity?: number;
      revenueMillimes?: number;
      voidedQuantity?: number;
      voidedMillimes?: number;
      unitCostMillimes?: number | null;
    }[];
    expect(analysed.find((row) => row.name === "Café express")).toMatchObject({
      kind: "BAR",
      soldQuantity: 2,
      revenueMillimes: 3500,
      voidedQuantity: 0,
      unitCostMillimes: null,
    });
    expect(analysed.find((row) => row.name === "Brik")).toMatchObject({
      kind: "KITCHEN",
      soldQuantity: 1,
      voidedQuantity: 1,
      voidedMillimes: 4500,
    });
    const drinks = await call(
      "GET",
      "/reports/product-analysis?from=2026-10-10&to=2026-10-10&stationKind=BAR",
      adminJwt,
    );
    expect((drinks.json().products as { name?: string }[]).map((row) => row.name)).toEqual([
      "Café express",
    ]);
    const csv = await call(
      "GET",
      "/reports/payments?from=2026-10-10&to=2026-10-10&format=csv",
      adminJwt,
    );
    expect(csv.body.charCodeAt(0)).toBe(0xfeff);
    expect(csv.body).toContain(";");
    expect(csv.body).toContain("28,000");
    expect(csv.headers["content-type"]).toContain("text/csv");
    for (const path of [
      "/reports/sales/by-day",
      "/reports/stations",
      "/reports/servers",
      "/reports/voids",
      "/reports/stock-valuation",
      "/reports/food-cost",
      "/reports/staff-hours",
    ]) {
      const response = await call("GET", `${path}?from=2026-10-10&to=2026-10-10`, adminJwt);
      expect(response.statusCode).toBe(200);
      expect(response.json().notice).toContain("pas un document fiscal");
    }
  });

  it("answers the dashboard in under 500 ms after 90 days of history", async () => {
    await seedServiceHistory(sql, {
      siteId,
      days: 90,
      cutoffHour: 5,
      serverIds: [waiterId],
      cashierId,
      deviceId: cashierPcId,
      products: [
        {
          id: coffeeId,
          name: "Café express",
          priceMillimes: 2000,
          stationId: barStationId,
          drink: true,
        },
        {
          id: couscousId,
          name: "Couscous au poisson",
          priceMillimes: 28000,
          stationId: kitchenStationId,
          drink: false,
        },
      ],
      endDay: "2026-10-09",
    });
    const started = performance.now();
    const report = await call("GET", "/reports/dashboard?from=2026-07-12&to=2026-10-09", adminJwt);
    const elapsed = performance.now() - started;
    expect(report.statusCode).toBe(200);
    expect(report.json().orderCount).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(500);
  }, 60_000);

  it("publishes today's dishes and hides a list saved on another day", async () => {
    const before = await call("GET", "/daily-specials", waiterJwt);
    expect(before.statusCode).toBe(200);
    expect(before.json().businessDate).toBe("2026-10-10");
    expect(before.json().productIds).toEqual([]);

    const denied = await call("PUT", "/daily-specials", waiterJwt, { productIds: [couscousId] });
    expect(denied.statusCode).toBe(403);

    const saved = await call("PUT", "/daily-specials", adminJwt, {
      productIds: [couscousId, coffeeId, "0199c0a0-0000-7000-8000-000000000099"],
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().productIds).toEqual([couscousId, coffeeId]);

    const after = await call("GET", "/daily-specials", waiterJwt);
    expect(after.json().productIds).toEqual([couscousId, coffeeId]);

    await sql`
      update settings set value = ${sql.json({ businessDate: "2026-10-09", productIds: [couscousId] })}
      where site_id = ${siteId} and key = 'dailySpecials'
    `;
    const stale = await call("GET", "/daily-specials", waiterJwt);
    expect(stale.json().businessDate).toBe("2026-10-10");
    expect(stale.json().productIds).toEqual([]);
  });

  it("adds a daily dish that is not on the standing menu", async () => {
    const id = newId();
    const saved = await call("PUT", "/daily-specials", adminJwt, {
      offers: [
        {
          id: couscousId,
          productId: couscousId,
          nameFr: "ignoré",
          nameAr: "تجاهل",
          priceMillimes: 1,
        },
        { id, productId: null, nameFr: "Ojja du jour", nameAr: "عجة اليوم", priceMillimes: 18000 },
      ],
    });
    expect(saved.statusCode).toBe(200);
    const offers = (
      saved.json() as {
        offers: {
          productId: string;
          nameFr: string;
          priceMillimes: number;
          fromCatalog: boolean;
        }[];
      }
    ).offers;
    expect(offers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: couscousId, fromCatalog: true }),
        expect.objectContaining({
          productId: id,
          nameFr: "Ojja du jour",
          priceMillimes: 18000,
          fromCatalog: false,
        }),
      ]),
    );
    expect(offers.find((offer) => offer.productId === couscousId)?.priceMillimes).not.toBe(1);

    const listed = await call("GET", "/daily-specials", waiterJwt);
    expect(listed.json().productIds).toEqual(expect.arrayContaining([couscousId, id]));

    const cleared = await call("PUT", "/daily-specials", adminJwt, { offers: [] });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().productIds).toEqual([]);
    const hidden = await call("GET", "/admin/products", adminJwt);
    const row = (hidden.json().products as { id: string; is_active: boolean }[]).find(
      (product) => product.id === id,
    );
    expect(row?.is_active).toBe(false);
  });

  it("opens the morning service and closes it with bar and kitchen totals", async () => {
    const denied = await call("POST", "/service-recette/open", waiterJwt);
    expect(denied.statusCode).toBe(403);

    const opened = await call("POST", "/service-recette/open", cashierJwt);
    expect(opened.statusCode).toBe(200);
    expect(opened.json().service?.status).toBe("OPEN");

    const again = await call("POST", "/service-recette/open", cashierJwt);
    expect(again.statusCode).toBe(409);

    const at = "2026-10-10T12:00:00.000Z";
    const barOrder = newId();
    const kitchenOrder = newId();
    await sql`
      insert into orders (id, site_id, server_id, status, business_date, daily_number, total_millimes, version, opened_at, sent_at, closed_at)
      values
        (${barOrder}, ${siteId}, ${waiterId}, 'PAID', '2026-10-10', 1, 2000, 2, ${at}, ${at}, ${at}),
        (${kitchenOrder}, ${siteId}, ${waiterId}, 'PAID', '2026-10-10', 2, 28000, 2, ${at}, ${at}, ${at})
    `;
    await sql`
      insert into order_items (id, order_id, product_id, product_name_snapshot, unit_price_millimes, quantity, station_id, status, sent_at)
      values
        (${newId()}, ${barOrder}, ${coffeeId}, 'Café express', 2000, 2, ${barStationId}, 'ACTIVE', ${at}),
        (${newId()}, ${kitchenOrder}, ${couscousId}, 'Couscous au poisson', 28000, 1, ${kitchenStationId}, 'ACTIVE', ${at})
    `;

    const closed = await call("POST", "/service-recette/close", cashierJwt);
    expect(closed.statusCode).toBe(200);
    expect(closed.json().totals?.all?.quantity).toBe(3);
    expect(closed.json().totals?.all?.revenueMillimes).toBe(32000);
    expect(closed.json().totals?.bar?.quantity).toBe(2);
    expect(closed.json().totals?.kitchen?.revenueMillimes).toBe(28000);
    expect(closed.json().notice).toBe("Rapport de gestion, pas un document fiscal");
  });

  it("lets the cashier add a table and refuses a waiter", async () => {
    const denied = await call("POST", "/tables", waiterJwt, {
      id: newId(),
      label: "101",
      zone: "101-125",
      seats: 4,
    });
    expect(denied.statusCode).toBe(403);
    const created = await call("POST", "/tables", cashierJwt, {
      id: newId(),
      label: "101",
      zone: "101-125",
      seats: 4,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().label).toBe("101");
  });

  it("stores a product photo and replaces it", async () => {
    const denied = await call("PUT", `/products/${coffeeId}/image`, waiterJwt, {
      contentType: "image/png",
      dataBase64: TINY_PNG,
    });
    expect(denied.statusCode).toBe(403);

    const saved = await call("PUT", `/products/${coffeeId}/image`, adminJwt, {
      contentType: "image/png",
      dataBase64: TINY_PNG,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().imageType).toBe("image/png");

    const image = await app.inject({ method: "GET", url: `/product-images/${coffeeId}` });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");

    const catalog = await call("GET", "/catalog", waiterJwt);
    const drinks = (
      catalog.json() as unknown as {
        categories: { products: { id: string; imageUrl: string | null }[] }[];
      }
    ).categories.flatMap((category) => category.products);
    expect(drinks.find((product) => product.id === coffeeId)?.imageUrl).toBe(
      `/product-images/${coffeeId}`,
    );

    const cleared = await call("DELETE", `/products/${coffeeId}/image`, adminJwt);
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().imageType).toBeNull();
    const gone = await app.inject({ method: "GET", url: `/product-images/${coffeeId}` });
    expect(gone.statusCode).toBe(404);
  });
});

async function seedReportDay() {
  const specs = [
    {
      id: newId(),
      product: coffeeId,
      station: barStationId,
      name: "Café express",
      price: 2000,
      qty: 1,
      method: "CASH",
      at: "2026-10-10T11:00:00.000Z",
      extraVoid: false,
    },
    {
      id: newId(),
      product: couscousId,
      station: kitchenStationId,
      name: "Couscous au poisson",
      price: 28000,
      qty: 1,
      method: "CARD",
      at: "2026-10-10T19:00:00.000Z",
      extraVoid: false,
    },
    {
      id: newId(),
      product: brikId,
      station: kitchenStationId,
      name: "Brik",
      price: 4500,
      qty: 1,
      method: "CASH",
      at: "2026-10-10T12:30:00.000Z",
      extraVoid: true,
    },
    {
      id: newId(),
      product: coffeeId,
      station: barStationId,
      name: "Café express",
      price: 1500,
      qty: 1,
      method: "CASH",
      at: "2026-10-10T23:30:00.000Z",
      extraVoid: false,
    },
  ];
  let number = 1;
  for (const spec of specs) {
    const itemId = newId();
    await sql`
      insert into orders (
        id, site_id, server_id, status, business_date, daily_number, total_millimes, version, opened_at, sent_at, closed_at
      ) values (
        ${spec.id}, ${siteId}, ${waiterId}, 'PAID', '2026-10-10', ${number}, ${spec.price}, 2,
        ${spec.at}, ${spec.at}, ${spec.at}
      )
    `;
    await sql`
      insert into order_items (
        id, order_id, product_id, product_name_snapshot, unit_price_millimes, quantity, station_id, status, sent_at
      ) values (
        ${itemId}, ${spec.id}, ${spec.product}, ${spec.name}, ${spec.price}, ${spec.qty}, ${spec.station}, 'ACTIVE', ${spec.at}
      )
    `;
    if (spec.extraVoid) {
      await sql`
        insert into order_items (
          id, order_id, product_id, product_name_snapshot, unit_price_millimes, quantity, station_id, status, sent_at, voided_at, voided_by
        ) values (
          ${newId()}, ${spec.id}, ${brikId}, 'Brik', 4500, 1, ${kitchenStationId}, 'VOIDED', ${spec.at}, ${spec.at}, ${adminId}
        )
      `;
    }
    await sql`
      insert into payments (id, site_id, order_id, method, amount_millimes, cashier_id, created_at)
      values (${newId()}, ${siteId}, ${spec.id}, ${spec.method}::payment_method, ${spec.price}, ${cashierId}, ${spec.at})
    `;
    number += 1;
  }
}

async function sendProduct(productId: string) {
  const created = await call("POST", "/orders", waiterJwt, {
    id: newId(),
    items: [{ productId, quantity: 1 }],
  });
  expect(created.statusCode).toBe(201);
  const sent = await call("POST", `/orders/${created.json().id}/send`, waiterJwt);
  return sent;
}

async function voidSent(productId: string) {
  const created = await call("POST", "/orders", waiterJwt, {
    id: newId(),
    items: [{ productId, quantity: 1 }],
  });
  await call("POST", `/orders/${created.json().id}/send`, waiterJwt);
  const itemId = created.json().items?.[0]?.id ?? "";
  const request = await call(
    "POST",
    `/orders/${created.json().id}/cancellation-requests`,
    waiterJwt,
    {
      orderItemId: itemId,
      reason: "Client a changé d'avis",
    },
  );
  await call("POST", `/cancellation-requests/${request.json().cancellationId}/decision`, adminJwt, {
    approve: true,
  });
}

async function clearTables() {
  await sql`
    truncate table audit_log, sync_outbox, print_jobs, cancellation_requests, payments, cash_movements,
      cash_shifts, expenses, purchase_lines, purchases, stock_inventory_lines, stock_inventories,
      stock_movements, product_ingredients, stock_items, suppliers, attendance, staff_shifts, settings,
      order_items, orders, order_counters, floor_tables, products, categories, stations, printers, devices, users, sites
    restart identity cascade
  `;
}

async function reset() {
  await sql`insert into sites (id, name, address) values (${siteId}, 'Test', 'Tunis')`;
  await sql`
    insert into users (id, site_id, display_name, role, email, password_hash)
    values (${adminId}, ${siteId}, 'Karim', 'ADMIN', 'admin@resto.local', ${adminHash})
  `;
  await sql`
    insert into users (id, site_id, display_name, role, pin_hash) values
      (${cashierId}, ${siteId}, 'Sonia', 'CASHIER', ${cashierHash}),
      (${waiterId}, ${siteId}, 'Mohamed', 'WAITER', ${waiterHash})
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
      (${brikId}, ${siteId}, ${mainsId}, 'Brik', 'بريك', 4500, 700, true)
  `;
  await sql`
    insert into floor_tables (id, site_id, label, zone, seats) values (${tableId}, ${siteId}, 'T3', 'Salle', 4)
  `;
}

function tokenOf(result: { statusCode?: number; token?: string }): string {
  if (!result.token) {
    throw new Error(`login failed: ${result.statusCode ?? "unknown"}`);
  }
  return result.token;
}

interface InjectedJson {
  id?: string;
  label?: string;
  pin?: string;
  notice?: string;
  error?: { code?: string };
  items?: { id?: string; unitPriceMillimes?: number }[];
  lines?: { diffBase?: number; diffValueMillimes?: number }[];
  totalMillimes?: number;
  revenueMillimes?: number;
  orderCount?: number;
  averageBasketMillimes?: number;
  voidCount?: number;
  voidValueMillimes?: number;
  points?: { hour?: number; revenue_millimes?: number }[];
  methods?: { method?: string; amount_millimes?: number }[];
  vatMillimes?: number;
  products?: { name?: string; revenue_millimes?: number }[];
  cancellationId?: string;
  expectedMillimes?: number;
  varianceMillimes?: number;
  businessDate?: string;
  productIds?: string[];
  imageType?: string | null;
  service?: { status?: string };
  users?: { id?: string; role?: string; has_pin?: boolean; has_password?: boolean }[];
  totals?: {
    all?: { quantity?: number; revenueMillimes?: number };
    bar?: { quantity?: number; revenueMillimes?: number };
    kitchen?: { quantity?: number; revenueMillimes?: number };
  };
}

interface Injected {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
  json: () => InjectedJson;
}

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function call(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  token: string,
  payload?: unknown,
): Promise<Injected> {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  } as never) as Promise<Injected>;
}

async function loginAdmin() {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login-admin",
    payload: { email: "admin@resto.local", password: adminPassword },
  });
  return response.json() as { token: string };
}

async function loginPin(userId: string, pin: string, deviceToken: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login-pin",
    headers: { "x-device-token": deviceToken },
    payload: { userId, pin },
  });
  return { statusCode: response.statusCode, ...(response.json() as { token?: string }) };
}

function connect(token: string): Socket {
  return io(`http://127.0.0.1:${port}`, {
    auth: { token },
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
