import { z } from "zod";

import { deviceTypeSchema } from "../domain/enums.js";

const pinSchema = z.string().regex(/^\d{4,6}$/);
const uuidSchema = z.uuid();

export const loginStaffSchema = z.strictObject({
  pin: z.string().regex(/^\d{4}$/),
});
export type LoginStaffInput = z.infer<typeof loginStaffSchema>;

export const loginPinSchema = z.strictObject({
  userId: uuidSchema,
  pin: pinSchema,
});
export type LoginPinInput = z.infer<typeof loginPinSchema>;

export const loginAdminSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(8),
});
export type LoginAdminInput = z.infer<typeof loginAdminSchema>;

export const registerDeviceSchema = z.strictObject({
  name: z.string().trim().min(2).max(60),
  type: deviceTypeSchema,
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

const orderLineSchema = z.strictObject({
  productId: uuidSchema,
  quantity: z.number().int().min(1).max(99),
  note: z.string().max(120).optional(),
});

export const createOrderSchema = z.strictObject({
  id: uuidSchema,
  tableId: uuidSchema.nullable().optional(),
  note: z.string().max(200).optional(),
  items: z.array(orderLineSchema).min(1),
  sendImmediately: z.boolean().default(false),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const addItemsSchema = z.strictObject({
  items: z.array(orderLineSchema).min(1),
});
export type AddItemsInput = z.infer<typeof addItemsSchema>;

export const updateOrderItemSchema = z
  .strictObject({
    quantity: z.number().int().min(1).max(99).optional(),
    note: z.string().max(120).nullable().optional(),
  })
  .refine((value) => value.quantity !== undefined || value.note !== undefined, {
    message: "Quantity or note is required",
  });
export type UpdateOrderItemInput = z.infer<typeof updateOrderItemSchema>;

export const requestCancellationSchema = z.strictObject({
  orderItemId: uuidSchema.nullable().optional(),
  reason: z.string().trim().min(3).max(200),
});
export type RequestCancellationInput = z.infer<typeof requestCancellationSchema>;

export const decideCancellationSchema = z.strictObject({
  approve: z.boolean(),
  adminOverride: z
    .strictObject({
      email: z.email(),
      password: z.string().min(1),
    })
    .optional(),
});
export type DecideCancellationInput = z.infer<typeof decideCancellationSchema>;

export * from "./admin.js";
