import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn } from "./common.js";
import { purchasePaymentStatusEnum, purchaseStatusEnum } from "./enums.js";
import { sites, users } from "./identity.js";
import { stockItems } from "./inventory.js";
import { suppliers } from "./suppliers.js";

export const purchases = pgTable("purchases", {
  id: idColumn(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "restrict" }),
  invoiceRef: text("invoice_ref"),
  purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
  status: purchaseStatusEnum("status").notNull().default("DRAFT"),
  totalMillimes: integer("total_millimes").notNull().default(0),
  paymentStatus: purchasePaymentStatusEnum("payment_status").notNull().default("UNPAID"),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
});

export const purchaseLines = pgTable(
  "purchase_lines",
  {
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "restrict" }),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "restrict" }),
    quantityBase: integer("quantity_base").notNull(),
    totalCostMillimes: integer("total_cost_millimes").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.purchaseId, table.stockItemId] }),
    check("purchase_lines_quantity_positive", sql`${table.quantityBase} > 0`),
    check("purchase_lines_cost_non_negative", sql`${table.totalCostMillimes} >= 0`),
  ],
);

export const stockInventories = pgTable("stock_inventories", {
  id: idColumn(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  takenAt: timestamp("taken_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  takenBy: uuid("taken_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  note: text("note"),
});

export const stockInventoryLines = pgTable(
  "stock_inventory_lines",
  {
    inventoryId: uuid("inventory_id")
      .notNull()
      .references(() => stockInventories.id, { onDelete: "restrict" }),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "restrict" }),
    expectedBase: integer("expected_base").notNull(),
    countedBase: integer("counted_base").notNull(),
    diffBase: integer("diff_base").notNull(),
    diffValueMillimes: integer("diff_value_millimes").notNull(),
  },
  (table) => [primaryKey({ columns: [table.inventoryId, table.stockItemId] })],
);
