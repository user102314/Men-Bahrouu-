import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { products } from "./catalog.js";
import { idColumn } from "./common.js";
import { baseUnitEnum, stockMovementReasonEnum } from "./enums.js";
import { sites, users } from "./identity.js";
import { suppliers } from "./suppliers.js";

export const stockItems = pgTable(
  "stock_items",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    nameFr: text("name_fr").notNull(),
    nameAr: text("name_ar"),
    baseUnit: baseUnitEnum("base_unit").notNull(),
    quantityBase: integer("quantity_base").notNull().default(0),
    minThresholdBase: integer("min_threshold_base").notNull().default(0),
    avgCostMillimesPer1000Base: integer("avg_cost_millimes_per_1000_base").notNull().default(0),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    unique("stock_items_site_id_code_unique").on(table.siteId, table.code),
    check("stock_items_threshold_non_negative", sql`${table.minThresholdBase} >= 0`),
    check("stock_items_cost_non_negative", sql`${table.avgCostMillimesPer1000Base} >= 0`),
  ],
);

export const productIngredients = pgTable(
  "product_ingredients",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "restrict" }),
    quantityBase: integer("quantity_base").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.stockItemId] }),
    check("product_ingredients_quantity_positive", sql`${table.quantityBase} > 0`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "restrict" }),
    deltaBase: integer("delta_base").notNull(),
    reason: stockMovementReasonEnum("reason").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    unitCost: integer("unit_cost"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_movements_item_created_idx").on(table.stockItemId, table.createdAt),
    check("stock_movements_delta_nonzero", sql`${table.deltaBase} <> 0`),
  ],
);
