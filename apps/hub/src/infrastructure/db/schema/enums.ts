import { pgEnum } from "drizzle-orm/pg-core";

import {
  ATTENDANCE_SOURCES,
  BASE_UNITS,
  CANCELLATION_STATUSES,
  CASH_MOVEMENT_TYPES,
  DEVICE_TYPES,
  EXPENSE_CATEGORIES,
  ORDER_ITEM_STATUSES,
  ORDER_STATUSES,
  OUTBOX_OPS,
  PAYMENT_METHODS,
  PRINT_JOB_STATUSES,
  PRINT_JOB_TYPES,
  PURCHASE_PAYMENT_STATUSES,
  PURCHASE_STATUSES,
  ROLES,
  SHIFT_STATUSES,
  STATION_KINDS,
  STOCK_MOVEMENT_REASONS,
  TABLE_STATUSES,
} from "@resto/shared";

export const roleEnum = pgEnum("user_role", ROLES);
export const deviceTypeEnum = pgEnum("device_type", DEVICE_TYPES);
export const stationKindEnum = pgEnum("station_kind", STATION_KINDS);
export const tableStatusEnum = pgEnum("table_status", TABLE_STATUSES);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const orderItemStatusEnum = pgEnum("order_item_status", ORDER_ITEM_STATUSES);
export const printJobTypeEnum = pgEnum("print_job_type", PRINT_JOB_TYPES);
export const printJobStatusEnum = pgEnum("print_job_status", PRINT_JOB_STATUSES);
export const cancellationStatusEnum = pgEnum("cancellation_status", CANCELLATION_STATUSES);
export const outboxOpEnum = pgEnum("outbox_op", OUTBOX_OPS);
export const baseUnitEnum = pgEnum("base_unit", BASE_UNITS);
export const stockMovementReasonEnum = pgEnum("stock_movement_reason", STOCK_MOVEMENT_REASONS);
export const purchaseStatusEnum = pgEnum("purchase_status", PURCHASE_STATUSES);
export const purchasePaymentStatusEnum = pgEnum("purchase_payment_status", PURCHASE_PAYMENT_STATUSES);
export const expenseCategoryEnum = pgEnum("expense_category", EXPENSE_CATEGORIES);
export const cashMovementTypeEnum = pgEnum("cash_movement_type", CASH_MOVEMENT_TYPES);
export const shiftStatusEnum = pgEnum("shift_status", SHIFT_STATUSES);
export const attendanceSourceEnum = pgEnum("attendance_source", ATTENDANCE_SOURCES);
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);
