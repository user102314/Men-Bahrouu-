import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { products, stations } from "./catalog.js";
import { idColumn, timestampColumns } from "./common.js";
import { cancellationStatusEnum, orderItemStatusEnum, orderStatusEnum } from "./enums.js";
import { floorTables } from "./floor.js";
import { sites, users } from "./identity.js";

export const orderCounters = pgTable(
  "order_counters",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    businessDate: date("business_date", { mode: "string" }).notNull(),
    lastNumber: integer("last_number").notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.businessDate] })],
);

export const orders = pgTable(
  "orders",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    tableId: uuid("table_id").references(() => floorTables.id, { onDelete: "restrict" }),
    serverId: uuid("server_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull(),
    businessDate: date("business_date", { mode: "string" }).notNull(),
    dailyNumber: integer("daily_number").notNull(),
    note: text("note"),
    totalMillimes: integer("total_millimes").notNull(),
    version: integer("version").notNull().default(1),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "string" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    ...timestampColumns(),
  },
  (table) => [
    unique("orders_site_business_date_daily_number_unique").on(
      table.siteId,
      table.businessDate,
      table.dailyNumber,
    ),
    index("orders_site_id_status_idx").on(table.siteId, table.status),
    index("orders_server_id_idx").on(table.serverId),
    uniqueIndex("orders_one_open_per_table")
      .on(table.tableId)
      .where(
        sql`${table.tableId} is not null and ${table.status} in ('DRAFT', 'SENT', 'SERVED')`,
      ),
    check("orders_total_non_negative", sql`${table.totalMillimes} >= 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: idColumn(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    unitPriceMillimes: integer("unit_price_millimes").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note"),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "restrict" }),
    status: orderItemStatusEnum("status").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    voidedAt: timestamp("voided_at", { withTimezone: true, mode: "string" }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    ...timestampColumns(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_unit_price_non_negative", sql`${table.unitPriceMillimes} >= 0`),
  ],
);

export const cancellationRequests = pgTable("cancellation_requests", {
  id: idColumn(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "restrict" }),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  status: cancellationStatusEnum("status").notNull(),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "restrict" }),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: "string" }),
  overrideBy: uuid("override_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});
