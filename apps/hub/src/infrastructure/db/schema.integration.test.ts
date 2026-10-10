import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";

import { allocateDailyNumber } from "./order-counter.js";
import { databaseUrlFor, loadRootEnv, prepareTestDatabase } from "./prepare-test-database.js";

const siteId = "0199c0a0-0000-7000-8000-00000000a001";
const userId = "0199c0a0-0000-7000-8000-00000000a002";
const printerId = "0199c0a0-0000-7000-8000-00000000a003";
const stationId = "0199c0a0-0000-7000-8000-00000000a004";
const categoryId = "0199c0a0-0000-7000-8000-00000000a005";
const productId = "0199c0a0-0000-7000-8000-00000000a006";
const orderId = "0199c0a0-0000-7000-8000-00000000a007";
const auditId = "0199c0a0-0000-7000-8000-00000000a008";

let sql: postgres.Sql;

beforeAll(async () => {
  loadRootEnv();
  await prepareTestDatabase();
  sql = postgres(databaseUrlFor("resto_test"), { max: 20 });
});

afterAll(async () => {
  await sql.end();
});

beforeEach(async () => {
  await sql`
    truncate table
      audit_log,
      sync_outbox,
      print_jobs,
      cancellation_requests,
      order_items,
      orders,
      order_counters,
      floor_tables,
      products,
      categories,
      stations,
      printers,
      devices,
      users,
      sites
    restart identity cascade
  `;
});

describe("database constraints", () => {
  it("rejects a negative price and a zero quantity", async () => {
    await insertCatalog();
    await expect(sql`
      insert into products (
        id, site_id, category_id, name_fr, name_ar, price_millimes, vat_rate_bp
      ) values (
        '0199c0a0-0000-7000-8000-00000000a009', ${siteId}, ${categoryId},
        'Invalide', 'غير صالح', -1, 700
      )
    `).rejects.toThrow(/products_price_non_negative/);
    await expect(sql`
      insert into order_items (
        id, order_id, product_id, product_name_snapshot, unit_price_millimes, quantity, station_id, status
      ) values (
        '0199c0a0-0000-7000-8000-00000000a00a', ${orderId}, ${productId},
        'Café', 2000, 0, ${stationId}, 'ACTIVE'
      )
    `).rejects.toThrow(/order_items_quantity_positive/);
  });

  it("rejects a duplicate daily number", async () => {
    await insertCatalog();
    await insertOrder("0199c0a0-0000-7000-8000-00000000a00b", 1);
    await expect(insertOrder("0199c0a0-0000-7000-8000-00000000a00c", 1)).rejects.toThrow(
      /orders_site_business_date_daily_number_unique/,
    );
  });

  it("blocks updates and deletes on the audit log", async () => {
    await insertSite();
    await sql`
      insert into audit_log (id, site_id, action, entity_type)
      values (${auditId}, ${siteId}, 'test.event', 'site')
    `;
    await expect(
      sql`update audit_log set action = 'changed' where id = ${auditId}`,
    ).rejects.toThrow(/immutable/);
    await expect(sql`delete from audit_log where id = ${auditId}`).rejects.toThrow(/immutable/);
  });

  it("allocates daily numbers 1 through 20 under concurrent calls", async () => {
    await insertSite();
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () => allocateDailyNumber(sql, siteId, "2026-10-10")),
    );
    expect([...numbers].sort((left, right) => left - right)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });
});

async function insertSite(): Promise<void> {
  await sql`
    insert into sites (id, name, address)
    values (${siteId}, 'Test', 'Tunis')
  `;
}

async function insertCatalog(): Promise<void> {
  await insertSite();
  await sql`
    insert into users (id, site_id, display_name, role, pin_hash)
    values (${userId}, ${siteId}, 'Tester', 'WAITER', 'hash')
  `;
  await sql`
    insert into printers (id, site_id, name, host)
    values (${printerId}, ${siteId}, 'Bar', '127.0.0.1')
  `;
  await sql`
    insert into stations (id, site_id, kind, name, printer_id)
    values (${stationId}, ${siteId}, 'BAR', 'Bar', ${printerId})
  `;
  await sql`
    insert into categories (id, site_id, name_fr, name_ar, station_id, sort_order)
    values (${categoryId}, ${siteId}, 'Boissons', 'مشروبات', ${stationId}, 1)
  `;
  await sql`
    insert into products (id, site_id, category_id, name_fr, name_ar, price_millimes, vat_rate_bp)
    values (${productId}, ${siteId}, ${categoryId}, 'Café', 'قهوة', 2000, 700)
  `;
  await insertOrder(orderId, 7);
}

async function insertOrder(id: string, dailyNumber: number): Promise<void> {
  await sql`
    insert into orders (
      id, site_id, server_id, status, business_date, daily_number, total_millimes, opened_at
    ) values (
      ${id}, ${siteId}, ${userId}, 'DRAFT', '2026-10-10', ${dailyNumber}, 0, now()
    )
  `;
}
