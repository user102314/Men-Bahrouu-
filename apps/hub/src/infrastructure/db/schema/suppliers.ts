import { boolean, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestampColumns } from "./common.js";
import { sites } from "./identity.js";

export const suppliers = pgTable(
  "suppliers",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    phone: text("phone"),
    note: text("note"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestampColumns(),
  },
  (table) => [unique("suppliers_site_id_name_unique").on(table.siteId, table.name)],
);
