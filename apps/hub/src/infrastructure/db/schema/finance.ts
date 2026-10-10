import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn } from "./common.js";
import { cashMovementTypeEnum, expenseCategoryEnum, paymentMethodEnum, shiftStatusEnum } from "./enums.js";
import { devices, sites, users } from "./identity.js";
import { orders } from "./ordering.js";
import { suppliers } from "./suppliers.js";

export const expenses = pgTable(
  "expenses",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    category: expenseCategoryEnum("category").notNull(),
    amountMillimes: integer("amount_millimes").notNull(),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    note: text("note"),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    isVoid: boolean("is_void").notNull().default(false),
  },
  (table) => [check("expenses_amount_positive", sql`${table.amountMillimes} > 0`)],
);

export const cashShifts = pgTable(
  "cash_shifts",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: shiftStatusEnum("status").notNull().default("OPEN"),
    openingFloatMillimes: integer("opening_float_millimes").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    countedMillimes: integer("counted_millimes"),
    expectedMillimes: integer("expected_millimes"),
    varianceMillimes: integer("variance_millimes"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("cash_shifts_one_open_per_device").on(table.deviceId).where(sql`${table.status} = 'OPEN'`),
    check("cash_shifts_float_non_negative", sql`${table.openingFloatMillimes} >= 0`),
  ],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: idColumn(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => cashShifts.id, { onDelete: "restrict" }),
    type: cashMovementTypeEnum("type").notNull(),
    amountMillimes: integer("amount_millimes").notNull(),
    reason: text("reason").notNull(),
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [check("cash_movements_amount_positive", sql`${table.amountMillimes} > 0`)],
);

export const payments = pgTable(
  "payments",
  {
    id: idColumn(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    method: paymentMethodEnum("method").notNull(),
    amountMillimes: integer("amount_millimes").notNull(),
    tenderedMillimes: integer("tendered_millimes"),
    changeMillimes: integer("change_millimes"),
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    shiftId: uuid("shift_id").references(() => cashShifts.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [check("payments_amount_positive", sql`${table.amountMillimes} > 0`)],
);
