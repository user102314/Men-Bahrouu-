import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { printers, stations } from "./catalog.js";
import { idColumn, timestampColumns } from "./common.js";
import { printJobStatusEnum, printJobTypeEnum } from "./enums.js";
import { sites } from "./identity.js";
import { orders } from "./ordering.js";

export const printJobs = pgTable(
  "print_jobs",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "restrict" }),
    printerId: uuid("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "restrict" }),
    type: printJobTypeEnum("type").notNull(),
    status: printJobStatusEnum("status").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "string" }),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    lastError: text("last_error"),
    printedAt: timestamp("printed_at", { withTimezone: true, mode: "string" }),
    ...timestampColumns(),
  },
  (table) => [
    index("print_jobs_status_created_at_idx").on(table.status, table.createdAt),
    index("print_jobs_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
    check("print_jobs_attempts_non_negative", sql`${table.attempts} >= 0`),
  ],
);
