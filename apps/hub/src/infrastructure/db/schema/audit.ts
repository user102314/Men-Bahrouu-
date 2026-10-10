import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { idColumn } from "./common.js";
import { devices, sites, users } from "./identity.js";

export const auditLog = pgTable(
  "audit_log",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_site_id_at_idx").on(table.siteId, table.at)],
);
