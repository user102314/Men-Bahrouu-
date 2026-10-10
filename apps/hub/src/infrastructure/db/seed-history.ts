import { businessDate } from "@resto/shared";
import type postgres from "postgres";

import { assertNotProduction } from "./dev-only.js";
import { openDatabase } from "./connection.js";

const SEED = 20261010;

export interface HistoryProduct {
  id: string;
  name: string;
  priceMillimes: number;
  stationId: string;
  drink: boolean;
}

export interface HistoryInput {
  siteId: string;
  days: number;
  cutoffHour: number;
  serverIds: readonly string[];
  cashierId: string;
  deviceId: string;
  products: readonly HistoryProduct[];
  endDay?: string;
}

/** Deterministic service history. Totals, business dates, and voids follow the live rules. */
export async function seedServiceHistory(sql: postgres.Sql, input: HistoryInput): Promise<{ orders: number }> {
  if (input.days < 1 || input.days > 120) {
    throw new Error("History days must be between 1 and 120");
  }
  if (input.products.length === 0 || input.serverIds.length === 0) {
    throw new Error("History needs products and servers");
  }
  const random = mulberry32(SEED);
  const end = input.endDay ?? "2026-10-09";
  const orders: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];
  const payments: Record<string, unknown>[] = [];
  const cancellations: Record<string, unknown>[] = [];
  const shifts: Record<string, unknown>[] = [];
  const counters: Record<string, unknown>[] = [];
  let sequence = 1;
  let orderCount = 0;

  for (let offset = input.days - 1; offset >= 0; offset -= 1) {
    const day = shiftDay(end, -offset);
    const weekDay = new Date(`${day}T12:00:00Z`).getUTCDay();
    const busy = weekDay === 5 || weekDay === 6 || weekDay === 0;
    const target = Math.round((busy ? 46 : 28) * (0.9 + random() * 0.2));
    let dailyNumber = 0;
    let cashTotal = 0;
    const opened = `${day}T10:00:00+01:00`;
    const shiftId = hid(sequence++);
    for (let n = 0; n < target; n += 1) {
      const hour = pickHour(random, busy);
      const minute = Math.floor(random() * 60);
      const at = new Date(`${day}T${pad(hour)}:${pad(minute)}:00+01:00`);
      const stamp = at.toISOString();
      const date = businessDate(at, input.cutoffHour);
      const drink = input.products.filter((product) => product.drink);
      const food = input.products.filter((product) => !product.drink);
      const first = pick(random, random() < 0.45 ? drink : food);
      const second = pick(random, input.products);
      const lines = [first, second].filter((product, index, all) => all.indexOf(product) === index);
      const serverId = input.serverIds[Math.floor(random() * input.serverIds.length)] ?? input.serverIds[0];
      if (!serverId) {
        continue;
      }
      dailyNumber += 1;
      const orderId = hid(sequence++);
      let total = 0;
      const built: Record<string, unknown>[] = [];
      const pendingVoids: { itemId: string; serverId: string; stamp: string }[] = [];
      for (const product of lines) {
        const quantity = random() < 0.2 ? 2 : 1;
        const voided = random() < 0.05 && lines.length > 1;
        const itemId = hid(sequence++);
        if (!voided) {
          total += product.priceMillimes * quantity;
        }
        built.push({
          id: itemId,
          order_id: orderId,
          product_id: product.id,
          product_name_snapshot: product.name,
          unit_price_millimes: product.priceMillimes,
          quantity,
          station_id: product.stationId,
          status: voided ? "VOIDED" : "ACTIVE",
          sent_at: stamp,
          voided_at: voided ? stamp : null,
          voided_by: voided ? input.cashierId : null,
          created_at: stamp,
          updated_at: stamp,
        });
        if (voided) {
          pendingVoids.push({ itemId, serverId, stamp });
        }
      }
      if (total <= 0) {
        continue;
      }
      for (const pending of pendingVoids) {
        cancellations.push({
          id: hid(sequence++),
          order_id: orderId,
          order_item_id: pending.itemId,
          requested_by: pending.serverId,
          reason: "Client a changé d'avis",
          status: "APPROVED",
          decided_by: input.cashierId,
          decided_at: pending.stamp,
          override_by: null,
          created_at: pending.stamp,
        });
      }
      const method = random() < 0.7 ? "CASH" : random() < 0.85 ? "CARD" : "MEAL_VOUCHER";
      if (method === "CASH") {
        cashTotal += total;
      }
      orders.push({
        id: orderId,
        site_id: input.siteId,
        table_id: null,
        server_id: serverId,
        status: "PAID",
        business_date: date,
        daily_number: dailyNumber,
        note: null,
        total_millimes: total,
        version: 2,
        opened_at: stamp,
        sent_at: stamp,
        closed_at: stamp,
        created_at: stamp,
        updated_at: stamp,
      });
      items.push(...built);
      payments.push({
        id: hid(sequence++),
        site_id: input.siteId,
        order_id: orderId,
        method,
        amount_millimes: total,
        tendered_millimes: method === "CASH" ? total : null,
        change_millimes: method === "CASH" ? 0 : null,
        cashier_id: input.cashierId,
        shift_id: shiftId,
        created_at: stamp,
      });
      orderCount += 1;
    }
    const expected = 50_000 + cashTotal;
    const variance = weekDay === 0 ? -1_500 : 0;
    shifts.push({
      id: shiftId,
      site_id: input.siteId,
      device_id: input.deviceId,
      cashier_id: input.cashierId,
      status: "CLOSED",
      opening_float_millimes: 50_000,
      opened_at: new Date(opened).toISOString(),
      closed_at: new Date(`${day}T23:30:00+01:00`).toISOString(),
      counted_millimes: expected + variance,
      expected_millimes: expected,
      variance_millimes: variance,
      note: variance === 0 ? null : "Écart de caisse",
    });
    counters.push({ site_id: input.siteId, business_date: day, last_number: dailyNumber });
  }

  await sql.begin(async (tx) => {
    await insertChunks(tx, "cash_shifts", shifts);
    await insertChunks(tx, "orders", orders);
    await insertChunks(tx, "order_items", items);
    await insertChunks(tx, "payments", payments);
    await insertChunks(tx, "cancellation_requests", cancellations);
    if (counters.length > 0) {
      await tx`
        insert into order_counters ${tx(counters, "site_id", "business_date", "last_number")}
        on conflict (site_id, business_date) do update set last_number = excluded.last_number
      `;
    }
  });
  return { orders: orderCount };
}

function hid(n: number): string {
  return `0199e000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function pickHour(random: () => number, busy: boolean): number {
  const lunch = [12, 12, 13, 13, 13, 14];
  const dinner = busy ? [19, 20, 20, 20, 21, 21, 22] : [19, 20, 20, 21];
  const pool = random() < 0.55 ? lunch : dinner;
  return pool[Math.floor(random() * pool.length)] ?? 13;
}

function pick<T>(random: () => number, values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) {
    throw new Error("Empty catalog");
  }
  return value;
}

async function insertChunks(sql: postgres.Sql | postgres.TransactionSql<Record<string, never>>, table: string, rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += 400) {
    const slice = rows.slice(index, index + 400);
    if (slice.length === 0 || !slice[0]) {
      continue;
    }
    const columns = Object.keys(slice[0]);
    await sql.unsafe(
      `insert into ${table} (${columns.join(", ")}) values ${slice
        .map(
          (_, row) =>
            `(${columns
              .map((column, columnIndex) => {
                const placeholder = `$${row * columns.length + columnIndex + 1}`;
                const cast = ENUM_CASTS[`${table}.${column}`];
                return cast ? `${placeholder}::${cast}` : placeholder;
              })
              .join(", ")})`,
        )
        .join(", ")}`,
      slice.flatMap((row) => columns.map((column) => row[column])) as never[],
    );
  }
}

const ENUM_CASTS: Record<string, string> = {
  "orders.status": "order_status",
  "order_items.status": "order_item_status",
  "payments.method": "payment_method",
  "cash_shifts.status": "shift_status",
  "cancellation_requests.status": "cancellation_status",
};

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const invoked = process.argv[1]?.replaceAll("\\", "/").endsWith("seed-history.ts") === true;
if (invoked) {
  try {
    assertNotProduction(process.env.NODE_ENV, "seed service history");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const daysFlag = process.argv.findIndex((arg) => arg === "--days");
  const days = Number(daysFlag >= 0 ? process.argv[daysFlag + 1] : 30);
  const siteId = process.env.SITE_ID;
  if (!siteId || !Number.isInteger(days)) {
    console.error("Usage: pnpm seed:history -- --days 30");
    process.exit(1);
  }
  const sql = openDatabase();
  const existing = await sql<{ count: number }[]>`select count(*)::int as count from orders where site_id = ${siteId}`;
  if ((existing[0]?.count ?? 0) > 0) {
    console.error("Refusing to add history because this site already has orders.");
    await sql.end();
    process.exit(1);
  }
  const products = await sql<{ id: string; name_fr: string; price_millimes: number; station_id: string; kind: string }[]>`
    select p.id, p.name_fr, p.price_millimes, c.station_id, s.kind
    from products p
    join categories c on c.id = p.category_id
    join stations s on s.id = c.station_id
    where p.site_id = ${siteId} and p.is_active
  `;
  const servers = await sql<{ id: string }[]>`
    select id from users where site_id = ${siteId} and role = 'WAITER' and is_active
  `;
  const cashier = await sql<{ id: string }[]>`
    select id from users where site_id = ${siteId} and role = 'CASHIER' and is_active limit 1
  `;
  const device = await sql<{ id: string }[]>`
    select id from devices where site_id = ${siteId} and type = 'CASHIER_PC' and is_active limit 1
  `;
  const cashierId = cashier[0]?.id;
  const deviceId = device[0]?.id;
  if (!cashierId || !deviceId || products.length === 0 || servers.length === 0) {
    console.error("Seed the catalog and staff before generating history.");
    await sql.end();
    process.exit(1);
  }
  const result = await seedServiceHistory(sql, {
    siteId,
    days,
    cutoffHour: Number(process.env.BUSINESS_DAY_CUTOFF_HOUR ?? 5),
    serverIds: servers.map((row) => row.id),
    cashierId,
    deviceId,
    products: products.map((row) => ({
      id: row.id,
      name: row.name_fr,
      priceMillimes: row.price_millimes,
      stationId: row.station_id,
      drink: row.kind === "BAR",
    })),
  });
  console.log(`Seeded ${result.orders} historical orders over ${days} days.`);
  await sql.end();
}
