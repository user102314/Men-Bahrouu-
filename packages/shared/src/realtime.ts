import { z } from "zod";

import { orderItemStatusSchema, orderStatusSchema, tableStatusSchema } from "./domain/enums.js";

const uuidSchema = z.uuid();

export const publicOrderItemSchema = z.strictObject({
  id: uuidSchema,
  productId: uuidSchema,
  productNameSnapshot: z.string(),
  unitPriceMillimes: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  note: z.string().nullable(),
  stationId: uuidSchema,
  status: orderItemStatusSchema,
  sentAt: z.string().nullable(),
});
export type PublicOrderItem = z.infer<typeof publicOrderItemSchema>;

export const publicOrderSchema = z.strictObject({
  id: uuidSchema,
  tableId: uuidSchema.nullable(),
  serverId: uuidSchema,
  serverName: z.string(),
  status: orderStatusSchema,
  businessDate: z.string(),
  dailyNumber: z.number().int().positive(),
  note: z.string().nullable(),
  totalMillimes: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  openedAt: z.string(),
  sentAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  items: z.array(publicOrderItemSchema),
});
export type PublicOrder = z.infer<typeof publicOrderSchema>;

export const orderRealtimeSchema = z.strictObject({
  version: z.number().int().positive(),
  order: publicOrderSchema,
});

export const tableRealtimeSchema = z.strictObject({
  version: z.number().int().positive(),
  table: z.strictObject({
    id: uuidSchema,
    label: z.string(),
    zone: z.string(),
    seats: z.number().int().positive(),
    status: tableStatusSchema,
    openOrderId: uuidSchema.nullable(),
  }),
});

export const cancellationRealtimeSchema = z.strictObject({
  version: z.number().int().positive(),
  serverId: uuidSchema,
  cancellation: z.strictObject({
    id: uuidSchema,
    orderId: uuidSchema,
    orderItemId: uuidSchema.nullable(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    reason: z.string(),
  }),
  order: publicOrderSchema,
});

export const REALTIME_EVENTS = [
  "order.created",
  "order.updated",
  "order.sent",
  "cancellation.requested",
  "cancellation.decided",
  "table.updated",
  "print.job.updated",
  "print.failed",
] as const;
export type RealtimeEventName = (typeof REALTIME_EVENTS)[number];
