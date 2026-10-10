import { sql } from "drizzle-orm";
import { date, pgTable, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn } from "./common.js";
import { attendanceSourceEnum } from "./enums.js";
import { sites, users } from "./identity.js";

export const staffShifts = pgTable("staff_shifts", {
  id: idColumn(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  workDate: date("work_date", { mode: "string" }).notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  note: text("note"),
});

export const attendance = pgTable(
  "attendance",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clockIn: timestamp("clock_in", { withTimezone: true, mode: "string" }).notNull(),
    clockOut: timestamp("clock_out", { withTimezone: true, mode: "string" }),
    source: attendanceSourceEnum("source").notNull(),
    editedBy: uuid("edited_by").references(() => users.id, { onDelete: "restrict" }),
    editReason: text("edit_reason"),
  },
  (table) => [
    uniqueIndex("attendance_one_open_per_user").on(table.userId).where(sql`${table.clockOut} is null`),
  ],
);
