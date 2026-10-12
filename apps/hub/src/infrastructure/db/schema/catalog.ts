import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestampColumns } from "./common.js";
import { stationKindEnum } from "./enums.js";
import { sites } from "./identity.js";

export const printers = pgTable("printers", {
  id: idColumn(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(9100),
  paperWidthMm: integer("paper_width_mm").notNull().default(80),
  isActive: boolean("is_active").notNull().default(true),
  ...timestampColumns(),
});

export const stations = pgTable("stations", {
  id: idColumn(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  kind: stationKindEnum("kind").notNull(),
  name: text("name").notNull(),
  printerId: uuid("printer_id")
    .notNull()
    .references(() => printers.id, { onDelete: "restrict" }),
  fallbackStationId: uuid("fallback_station_id").references((): AnyPgColumn => stations.id, {
    onDelete: "restrict",
  }),
  ...timestampColumns(),
});

export const categories = pgTable("categories", {
  id: idColumn(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  nameFr: text("name_fr").notNull(),
  nameAr: text("name_ar").notNull(),
  stationId: uuid("station_id")
    .notNull()
    .references(() => stations.id, { onDelete: "restrict" }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestampColumns(),
});

export const products = pgTable(
  "products",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    nameFr: text("name_fr").notNull(),
    nameAr: text("name_ar").notNull(),
    priceMillimes: integer("price_millimes").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    imageType: text("image_type"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestampColumns(),
  },
  (table) => [check("products_price_non_negative", sql`${table.priceMillimes} >= 0`)],
);
