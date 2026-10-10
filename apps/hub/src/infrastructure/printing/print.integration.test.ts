import { newId, ticketPayloadSchema, type TicketPayload } from "@resto/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";

import type { AppConfig } from "../../config/env.js";
import { hashSecret } from "../auth/argon2-hasher.js";
import { hashDeviceToken } from "../auth/device-token.js";
import { databaseUrlFor, loadRootEnv, prepareTestDatabase } from "../db/prepare-test-database.js";
import { decodeTicket } from "../../domain/printing/ticket-text.js";
import { buildApp } from "../../interfaces/http/app.js";
import { FakePrinterGateway } from "./fake-gateway.js";
import { PrintService } from "./print-service.js";

const siteId = "0199c0a0-0000-7000-8000-000000000001";
const adminId = "0199c0a0-0000-7000-8000-00000000d001";
const cashierId = "0199c0a0-0000-7000-8000-00000000d002";
const waiterId = "0199c0a0-0000-7000-8000-00000000d003";
const tabletId = "0199c0a0-0000-7000-8000-00000000d004";
const barPrinterId = "0199c0a0-0000-7000-8000-00000000d005";
const kitchenPrinterId = "0199c0a0-0000-7000-8000-00000000d006";
const barStationId = "0199c0a0-0000-7000-8000-00000000d007";
const kitchenStationId = "0199c0a0-0000-7000-8000-00000000d008";
const drinksId = "0199c0a0-0000-7000-8000-00000000d009";
const mainsId = "0199c0a0-0000-7000-8000-00000000d00a";
const coffeeId = "0199c0a0-0000-7000-8000-00000000d00b";
const couscousId = "0199c0a0-0000-7000-8000-00000000d00c";
const tableId = "0199c0a0-0000-7000-8000-00000000d00d";
const tabletToken = "tablet-print-token-0123456789abcd";
const waiterPin = "1234";
const adminPassword = "Admin#2026dev";

const config: AppConfig = {
  databaseUrl: "postgres://resto:resto@127.0.0.1:5432/resto_test",
  jwtSecret: "test-jwt-secret-with-at-least-32-chars",
  port: 0,
  siteId,
  corsOrigins: ["http://localhost:5173"],
  waiterSessionSeconds: 3600,
  adminSessionSeconds: 3600,
  lockoutAttempts: 5,
  lockoutSeconds: 300,
  businessDayCutoffHour: 5,
  printColumns: 48,
  printConnectTimeoutMs: 200,
  printWriteTimeoutMs: 200,
  printMaxAttempts: 5,
  nodeEnv: "test",
  version: "test",
};

let now = new Date("2026-10-10T12:00:00.000Z");
let sql: postgres.Sql;
let app: Awaited<ReturnType<typeof buildApp>>;
let fake: FakePrinterGateway;
let token = "";

beforeAll(async () => {
  loadRootEnv();
  await prepareTestDatabase();
  sql = postgres(databaseUrlFor("resto_test"), { max: 10 });
  fake = new FakePrinterGateway();
  app = await buildApp({
    sql,
    config,
    clock: { now: () => now },
    printerGateway: fake,
  });
  const pinHash = await hashSecret(waiterPin);
  const adminHash = await hashSecret(adminPassword);
  await clear();
  await seed(pinHash, adminHash);
  const login = await app.inject({
    method: "POST",
    url: "/auth/login-pin",
    headers: { "x-device-token": tabletToken },
    payload: { userId: waiterId, pin: waiterPin },
  });
  token = login.json().token as string;
});

afterAll(async () => {
  await app.close();
  await sql.end();
});

beforeEach(async () => {
  now = new Date("2026-10-10T12:00:00.000Z");
  fake.sent.length = 0;
  fake.offline.clear();
  app.printing.delivered.length = 0;
  await clear();
  const pinHash = await hashSecret(waiterPin);
  const adminHash = await hashSecret(adminPassword);
  await seed(pinHash, adminHash);
});

describe("printing", () => {
  it("prints a drink on the bar and a dish in the kitchen", async () => {
    await sendOrder([coffeeId, couscousId]);
    await printed(2);
    const texts = fake.sent.map((job) => decodeTicket(job.data));
    const bar = texts.find((text) => text.includes("BAR") && !text.includes("CUISINE"));
    const kitchen = texts.find((text) => text.includes("CUISINE"));
    expect(bar).toContain("Café express");
    expect(bar).not.toContain("Couscous");
    expect(kitchen).toContain("Couscous au poisson");
    expect(kitchen).not.toContain("Café");
  });

  it("prints a single ticket when every line is a drink", async () => {
    await sendOrder([coffeeId, coffeeId]);
    await printed(1);
    expect(fake.sent[0]?.port).toBe(9101);
  });

  it("prints an addition with only the new lines", async () => {
    const orderId = await sendOrder([coffeeId]);
    await printed(1);
    fake.sent.length = 0;
    const added = await app.inject({
      method: "POST",
      url: `/orders/${orderId}/items`,
      headers: bearer(),
      payload: { items: [{ productId: couscousId, quantity: 1, note: "sans piment" }] },
    });
    expect(added.statusCode).toBe(200);
    const sent = await app.inject({
      method: "POST",
      url: `/orders/${orderId}/send`,
      headers: bearer(),
    });
    expect(sent.statusCode).toBe(200);
    await printed(1);
    const text = decodeTicket(fake.sent[0]?.data ?? Buffer.from(""));
    expect(text).toContain("*** AJOUT ***");
    expect(text).toContain("Couscous au poisson");
    expect(text).toContain("sans piment");
    expect(text).not.toContain("Café");
  });

  it("prints a void ticket only at the station of the cancelled line", async () => {
    const orderId = await sendOrder([coffeeId, couscousId]);
    await printed(2);
    const detail = await app.inject({
      method: "GET",
      url: `/orders/${orderId}`,
      headers: bearer(),
    });
    const coffee = (
      detail.json().order.items as { id: string; productNameSnapshot: string }[]
    ).find((item) => item.productNameSnapshot.includes("Café"));
    const request = await app.inject({
      method: "POST",
      url: `/orders/${orderId}/cancellation-requests`,
      headers: bearer(),
      payload: { orderItemId: coffee?.id, reason: "Versé sur la table" },
    });
    const cashier = await loginCashier();
    const approved = await app.inject({
      method: "POST",
      url: `/cancellation-requests/${request.json().cancellationId}/decision`,
      headers: { authorization: `Bearer ${cashier}` },
      payload: {
        approve: true,
        adminOverride: { email: "admin@resto.local", password: adminPassword },
      },
    });
    expect(approved.statusCode).toBe(200);
    await printed(3);
    const voids = fake.sent
      .map((job) => decodeTicket(job.data))
      .filter((text) => text.includes("ANNULATION"));
    expect(voids).toHaveLength(1);
    expect(voids[0]).toContain("Café express");
    expect(voids[0]).not.toContain("Couscous");
    expect(voids[0]).toContain("BAR");
  });

  it("retries a dead printer, then fails, then succeeds on a manual retry", async () => {
    fake.offline.add("127.0.0.1:9102");
    const orderId = await sendOrder([couscousId]);
    await settle();
    for (let step = 0; step < 4; step += 1) {
      now = new Date(now.getTime() + 120_000);
      await app.printing.kickAndWait();
    }
    const failed = await sql<{ status: string; attempts: number }[]>`
      select status, attempts from print_jobs where order_id = ${orderId}
    `;
    expect(failed[0]?.status).toBe("FAILED");
    expect(failed[0]?.attempts).toBe(5);
    expect(app.printing.delivered.some((message) => message.name === "print.failed")).toBe(true);
    fake.offline.delete("127.0.0.1:9102");
    const jobId = (
      await sql<{ id: string }[]>`select id from print_jobs where order_id = ${orderId}`
    )[0]?.id;
    if (!jobId) {
      throw new Error("missing print job");
    }
    const cashier = await loginCashier();
    const retry = await app.inject({
      method: "POST",
      url: `/print-jobs/${jobId}/retry`,
      headers: { authorization: `Bearer ${cashier}` },
    });
    expect(retry.statusCode).toBe(200);
    await app.printing.kickAndWait();
    const printedRow = await sql<
      { status: string }[]
    >`select status from print_jobs where id = ${jobId}`;
    expect(printedRow[0]?.status).toBe("PRINTED");
  });

  it("switches to the fallback printer after repeated failures", async () => {
    fake.offline.add("127.0.0.1:9101");
    const orderId = await sendOrder([coffeeId]);
    await settle();
    for (let step = 0; step < 4; step += 1) {
      now = new Date(now.getTime() + 120_000);
      await app.printing.kickAndWait();
    }
    await app.printing.kickAndWait();
    const rows = await sql<{ status: string; payload: TicketPayload; fallback_used: boolean }[]>`
      select status, payload, fallback_used from print_jobs where order_id = ${orderId}
    `;
    expect(rows[0]?.fallback_used).toBe(true);
    expect(rows[0]?.payload.redirectedFrom).toBe("BAR");
    expect(rows[0]?.status).toBe("PRINTED");
    const text = fake.sent.map((job) => decodeTicket(job.data)).join("\n");
    expect(text).toContain("DEPUIS BAR");
  });

  it("resumes a job left in PRINTING and does not print one job twice", async () => {
    const orderId = await sendOrder([coffeeId]);
    await printed(1);
    await sql`update print_jobs set status = 'PRINTING', printed_at = null where order_id = ${orderId}`;
    fake.sent.length = 0;
    await app.printing.recoverInterrupted();
    const pending = await sql<
      { status: string }[]
    >`select status from print_jobs where order_id = ${orderId}`;
    expect(pending[0]?.status).toBe("PENDING");
    const second = new PrintService(
      sql,
      fake,
      { now: () => now },
      {
        siteId,
        columns: 48,
        connectTimeoutMs: 200,
        writeTimeoutMs: 200,
        maxAttempts: 5,
      },
      () => undefined,
    );
    await Promise.all([app.printing.kickAndWait(), second.kickAndWait()]);
    expect(fake.sent).toHaveLength(1);
    const done = await sql<
      { status: string }[]
    >`select status from print_jobs where order_id = ${orderId}`;
    expect(done[0]?.status).toBe("PRINTED");
  });

  it("reprints the original lines under a duplicate banner", async () => {
    const orderId = await sendOrder([couscousId]);
    await printed(1);
    const original = decodeTicket(fake.sent[0]?.data ?? Buffer.from(""));
    const cashier = await loginCashier();
    const reprint = await app.inject({
      method: "POST",
      url: `/orders/${orderId}/reprint`,
      headers: { authorization: `Bearer ${cashier}` },
      payload: {},
    });
    expect(reprint.statusCode).toBe(201);
    await printed(2);
    const copy = decodeTicket(fake.sent[1]?.data ?? Buffer.from(""));
    expect(copy).toContain("*** DUPLICATA ***");
    expect(copy).toContain("Couscous au poisson");
    expect(original).toContain("Couscous au poisson");
    const stored = await sql<{ payload: TicketPayload }[]>`
      select payload from print_jobs where order_id = ${orderId} and type = 'REPRINT'
    `;
    expect(ticketPayloadSchema.parse(stored[0]?.payload).lines).toEqual([
      expect.objectContaining({ nameFr: "Couscous au poisson", quantity: 1 }),
    ]);
  });
});

async function sendOrder(productIds: string[]): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/orders",
    headers: bearer(),
    payload: {
      id: newId(),
      items: productIds.map((productId) => ({ productId, quantity: 1 })),
      sendImmediately: true,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

async function printed(count: number) {
  const start = Date.now();
  while (fake.sent.length < count) {
    if (Date.now() - start > 3000) {
      throw new Error(`expected ${count} tickets, saw ${fake.sent.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function settle() {
  const start = Date.now();
  while (Date.now() - start < 500) {
    const rows = await sql<{ attempts: number }[]>`select attempts from print_jobs`;
    if (rows.some((row) => row.attempts >= 1)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function loginCashier() {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login-pin",
    headers: { "x-device-token": "cashier-print-token-0123456789ab" },
    payload: { userId: cashierId, pin: "4321" },
  });
  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}

function bearer() {
  return { authorization: `Bearer ${token}` };
}

async function clear() {
  await sql`
    truncate table audit_log, sync_outbox, print_jobs, cancellation_requests, order_items, orders,
      order_counters, floor_tables, products, categories, stations, printers, devices, users, sites
    restart identity cascade
  `;
}

async function seed(pinHash: string, adminHash: string) {
  const cashierHash = await hashSecret("4321");
  await sql`insert into sites (id, name, address) values (${siteId}, 'Test', 'Tunis')`;
  await sql`
    insert into users (id, site_id, display_name, role, email, password_hash, pin_hash) values
      (${adminId}, ${siteId}, 'Karim', 'ADMIN', 'admin@resto.local', ${adminHash}, null),
      (${cashierId}, ${siteId}, 'Sonia', 'CASHIER', null, null, ${cashierHash}),
      (${waiterId}, ${siteId}, 'Mohamed', 'WAITER', null, null, ${pinHash})
  `;
  await sql`
    insert into devices (id, site_id, name, type, token_hash) values
      (${tabletId}, ${siteId}, 'Tablette', 'TABLET', ${hashDeviceToken(tabletToken)}),
      ('0199c0a0-0000-7000-8000-00000000d00e', ${siteId}, 'Caisse', 'CASHIER_PC', ${hashDeviceToken("cashier-print-token-0123456789ab")})
  `;
  await sql`
    insert into printers (id, site_id, name, host, port) values
      (${barPrinterId}, ${siteId}, 'Bar', '127.0.0.1', 9101),
      (${kitchenPrinterId}, ${siteId}, 'Cuisine', '127.0.0.1', 9102)
  `;
  await sql`
    insert into stations (id, site_id, kind, name, printer_id, fallback_station_id) values
      (${kitchenStationId}, ${siteId}, 'KITCHEN', 'Cuisine', ${kitchenPrinterId}, null),
      (${barStationId}, ${siteId}, 'BAR', 'Bar', ${barPrinterId}, ${kitchenStationId})
  `;
  await sql`
    insert into categories (id, site_id, name_fr, name_ar, station_id) values
      (${drinksId}, ${siteId}, 'Boissons', 'مشروبات', ${barStationId}),
      (${mainsId}, ${siteId}, 'Plats', 'أطباق', ${kitchenStationId})
  `;
  await sql`
    insert into products (id, site_id, category_id, name_fr, name_ar, price_millimes, vat_rate_bp) values
      (${coffeeId}, ${siteId}, ${drinksId}, 'Café express', 'قهوة', 2000, 700),
      (${couscousId}, ${siteId}, ${mainsId}, 'Couscous au poisson', 'كسكسي', 28000, 700)
  `;
  await sql`
    insert into floor_tables (id, site_id, label, zone, seats) values (${tableId}, ${siteId}, 'T3', 'Salle', 4)
  `;
}
