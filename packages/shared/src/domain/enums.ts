import { z } from "zod";

export const ROLES = ["ADMIN", "CASHIER", "WAITER"] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

export const DEVICE_TYPES = ["TABLET", "CASHIER_PC", "PHONE", "PERSONAL"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];
export const deviceTypeSchema = z.enum(DEVICE_TYPES);

export const STATION_KINDS = ["BAR", "KITCHEN"] as const;
export type StationKind = (typeof STATION_KINDS)[number];
export const stationKindSchema = z.enum(STATION_KINDS);

export const TABLE_STATUSES = ["FREE", "OCCUPIED", "TO_PAY"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];
export const tableStatusSchema = z.enum(TABLE_STATUSES);

export const ORDER_STATUSES = ["DRAFT", "SENT", "SERVED", "PAID", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const ORDER_ITEM_STATUSES = ["ACTIVE", "VOIDED"] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];
export const orderItemStatusSchema = z.enum(ORDER_ITEM_STATUSES);

export const PRINT_JOB_TYPES = ["NEW", "ADD", "VOID", "REPRINT"] as const;
export type PrintJobType = (typeof PRINT_JOB_TYPES)[number];
export const printJobTypeSchema = z.enum(PRINT_JOB_TYPES);

export const PRINT_JOB_STATUSES = ["PENDING", "PRINTING", "PRINTED", "FAILED"] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];
export const printJobStatusSchema = z.enum(PRINT_JOB_STATUSES);

export const CANCELLATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type CancellationStatus = (typeof CANCELLATION_STATUSES)[number];
export const cancellationStatusSchema = z.enum(CANCELLATION_STATUSES);

export const PAYMENT_METHODS = ["CASH", "CARD", "MEAL_VOUCHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const STOCK_MOVEMENT_TYPES = ["IN", "OUT", "ADJUSTMENT"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];
export const stockMovementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES);

export const OUTBOX_OPS = ["UPSERT", "DELETE"] as const;
export type OutboxOp = (typeof OUTBOX_OPS)[number];
export const outboxOpSchema = z.enum(OUTBOX_OPS);
