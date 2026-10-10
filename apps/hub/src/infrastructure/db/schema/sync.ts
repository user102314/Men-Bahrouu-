import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { idColumn } from "./common.js";
import { outboxOpEnum } from "./enums.js";
import { sites } from "./identity.js";

export const syncOutbox = pgTable(
  "sync_outbox",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    op: outboxOpEnum("op").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => [
    index("sync_outbox_pending_idx")
      .on(table.createdAt)
      .where(sql`${table.sentAt} is null`),
    check("sync_outbox_attempts_non_negative", sql`${table.attempts} >= 0`),
  ],
);
