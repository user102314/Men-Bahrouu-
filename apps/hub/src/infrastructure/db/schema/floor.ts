import { boolean, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestampColumns } from "./common.js";
import { tableStatusEnum } from "./enums.js";
import { sites } from "./identity.js";

export const floorTables = pgTable(
  "floor_tables",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    zone: text("zone").notNull(),
    seats: integer("seats").notNull(),
    status: tableStatusEnum("status").notNull().default("FREE"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestampColumns(),
  },
  (table) => [unique("floor_tables_site_id_label_unique").on(table.siteId, table.label)],
);
