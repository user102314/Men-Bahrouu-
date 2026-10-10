import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestampColumns } from "./common.js";
import { deviceTypeEnum, roleEnum } from "./enums.js";

export const sites = pgTable("sites", {
  id: idColumn(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  timezone: text("timezone").notNull().default("Africa/Tunis"),
  currency: text("currency").notNull().default("TND"),
  ...timestampColumns(),
});

export const users = pgTable(
  "users",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    role: roleEnum("role").notNull(),
    email: text("email"),
    passwordHash: text("password_hash"),
    pinHash: text("pin_hash"),
    isActive: boolean("is_active").notNull().default(true),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "string" }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("users_site_id_email_unique")
      .on(table.siteId, table.email)
      .where(sql`${table.email} is not null`),
    check(
      "users_role_credentials",
      sql`(
        (${table.role} = 'ADMIN' and ${table.passwordHash} is not null and ${table.email} is not null)
        or (${table.role} in ('WAITER', 'CASHIER') and ${table.pinHash} is not null)
      )`,
    ),
    check("users_failed_attempts_non_negative", sql`${table.failedAttempts} >= 0`),
  ],
);

export const devices = pgTable("devices", {
  id: idColumn(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  type: deviceTypeEnum("type").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }),
  ...timestampColumns(),
});
