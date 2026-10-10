import { pgEnum } from "drizzle-orm/pg-core";

import {
  CANCELLATION_STATUSES,
  DEVICE_TYPES,
  ORDER_ITEM_STATUSES,
  ORDER_STATUSES,
  OUTBOX_OPS,
  PRINT_JOB_STATUSES,
  PRINT_JOB_TYPES,
  ROLES,
  STATION_KINDS,
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
