import {
  publicOrderSchema,
  type PaymentMethod,
  type PublicOrder,
  type Role,
  type TableStatus,
} from "@resto/shared";
import { z } from "zod";

import { readDevice } from "./device.js";
import { hubUrl } from "./hub-url.js";
import { clearSession, loadSession } from "./session.js";

const stationKindSchema = z.enum(["BAR", "KITCHEN"]);

export const catalogSchema = z.object({
  categories: z.array(
    z.object({
      id: z.uuid(),
      nameFr: z.string(),
      nameAr: z.string(),
      stationId: z.uuid(),
      stationKind: stationKindSchema,
      products: z.array(
        z.object({
          id: z.uuid(),
          nameFr: z.string(),
          nameAr: z.string(),
          priceMillimes: z.number().int().nonnegative(),
          isAvailable: z.boolean(),
        }),
      ),
    }),
  ),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const tablesSchema = z.object({
  tables: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      zone: z.string(),
      seats: z.number().int().positive(),
      status: z.enum(["FREE", "OCCUPIED", "TO_PAY"]),
      isActive: z.boolean().optional(),
      openOrderId: z.uuid().nullable(),
      occupiedSince: z.string().nullable(),
      ownedByMe: z.boolean(),
    }),
  ),
});
export type FloorTable = z.infer<typeof tablesSchema>["tables"][number];

export const ordersSchema = z.object({
  orders: z.array(publicOrderSchema),
  nextCursor: z.string().nullable(),
});
export type OrderList = z.infer<typeof ordersSchema>;

export const orderDetailSchema = z.object({
  order: publicOrderSchema,
  cancellations: z.array(
    z.object({
      id: z.uuid(),
      orderItemId: z.uuid().nullable(),
      reason: z.string(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    }),
  ),
  printJobs: z
    .array(
      z.object({
        id: z.uuid(),
        stationId: z.uuid(),
        type: z.string(),
        status: z.string(),
      }),
    )
    .optional(),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

export const profilesSchema = z.object({
  device: z.object({
    name: z.string(),
    type: z.enum(["TABLET", "CASHIER_PC", "PHONE", "PERSONAL"]),
  }),
  profiles: z.array(
    z.object({
      id: z.uuid(),
      displayName: z.string(),
      role: z.enum(["WAITER", "CASHIER", "ADMIN"]),
    }),
  ),
});
export type DeviceProfiles = z.infer<typeof profilesSchema>;

export const paymentResultSchema = z.object({
  notice: z.string(),
  payment: z.object({
    id: z.uuid(),
    amountMillimes: z.number().int(),
    method: z.enum(["CASH", "CARD", "MEAL_VOUCHER"]),
    tenderedMillimes: z.number().int().nullable(),
    changeMillimes: z.number().int().nullable(),
  }),
});
export type PaymentResult = z.infer<typeof paymentResultSchema>;

export const printJobsSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      stationId: z.uuid(),
      type: z.string(),
      status: z.string(),
      attempts: z.number().int(),
      lastError: z.string().nullable(),
      payload: z.unknown(),
    }),
  ),
});
export type PrintJob = z.infer<typeof printJobsSchema>["jobs"][number];

export const printerStatusSchema = z.object({
  printers: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      online: z.boolean(),
    }),
  ),
});

export const cancellationsSchema = z.object({
  cancellations: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      orderItemId: z.uuid().nullable(),
      reason: z.string(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    }),
  ),
});

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export class HubError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function retryAfter(details: unknown): number | undefined {
  if (!details || typeof details !== "object" || !("retryAfterSeconds" in details)) {
    return undefined;
  }
  const value = details.retryAfterSeconds;
  return typeof value === "number" ? value : undefined;
}

export async function hubRequest<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const session = loadSession();
  const device = readDevice();
  if (session) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }
  if (device) {
    headers.set("X-Device-Token", device);
  }
  let response: Response;
  try {
    response = await fetch(`${hubUrl()}${path}`, { ...init, headers });
  } catch {
    throw new HubError("HUB_UNREACHABLE", "Hub unreachable", 0);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    const code = parsed.success ? parsed.data.error.code : "UNKNOWN";
    if (response.status === 401 && !path.startsWith("/auth/login")) {
      clearSession();
    }
    throw new HubError(
      code,
      parsed.success ? parsed.data.error.message : code,
      response.status,
      parsed.success ? retryAfter(parsed.data.error.details) : undefined,
    );
  }
  return schema.parse(body);
}

export const api = {
  profiles: () => hubRequest("/auth/profiles", profilesSchema),
  loginPin: (userId: string, pin: string) =>
    hubRequest("/auth/login-pin", z.object({ token: z.string() }), {
      method: "POST",
      body: JSON.stringify({ userId, pin }),
    }),
  loginAdmin: (email: string, password: string) =>
    hubRequest("/auth/login-admin", z.object({ token: z.string() }), {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () =>
    hubRequest(
      "/auth/me",
      z.object({
        id: z.uuid(),
        displayName: z.string(),
        role: z.enum(["WAITER", "CASHIER", "ADMIN"]),
        siteId: z.uuid(),
      }),
    ),
  logout: () => hubRequest("/auth/logout", z.undefined(), { method: "POST" }),
  catalog: () => hubRequest("/catalog", catalogSchema),
  tables: () => hubRequest("/tables", tablesSchema),
  orders: (limit = 100) => hubRequest(`/orders?limit=${limit}`, ordersSchema),
  order: (id: string) => hubRequest(`/orders/${id}`, orderDetailSchema),
  createOrder: (body: {
    id: string;
    tableId?: string;
    items: { productId: string; quantity: number; note?: string }[];
  }) =>
    hubRequest("/orders", publicOrderSchema, {
      method: "POST",
      body: JSON.stringify({ ...body, sendImmediately: false }),
    }),
  addItems: (orderId: string, items: { productId: string; quantity: number; note?: string }[]) =>
    hubRequest(`/orders/${orderId}/items`, publicOrderSchema, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  updateItem: (orderId: string, itemId: string, body: { quantity?: number; note?: string | null }) =>
    hubRequest(`/orders/${orderId}/items/${itemId}`, publicOrderSchema, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteItem: (orderId: string, itemId: string) =>
    hubRequest(`/orders/${orderId}/items/${itemId}`, publicOrderSchema, { method: "DELETE" }),
  send: (orderId: string) =>
    hubRequest(`/orders/${orderId}/send`, publicOrderSchema, { method: "POST" }),
  requestBill: (orderId: string) =>
    hubRequest(`/orders/${orderId}/request-bill`, publicOrderSchema, { method: "POST" }),
  markServed: (orderId: string) =>
    hubRequest(`/orders/${orderId}/served`, publicOrderSchema, { method: "POST" }),
  requestCancellation: (orderId: string, orderItemId: string, reason: string) =>
    hubRequest(`/orders/${orderId}/cancellation-requests`, z.object({ order: publicOrderSchema }).passthrough(), {
      method: "POST",
      body: JSON.stringify({ orderItemId, reason }),
    }),
  cancellations: () => hubRequest("/cancellation-requests?status=PENDING", cancellationsSchema),
  decideCancellation: (
    id: string,
    approve: boolean,
    adminOverride?: { email: string; password: string },
  ) =>
    hubRequest(`/cancellation-requests/${id}/decision`, z.unknown(), {
      method: "POST",
      body: JSON.stringify({
        approve,
        ...(adminOverride ? { adminOverride } : {}),
      }),
    }),
  pay: (orderId: string, method: PaymentMethod, tenderedMillimes?: number) =>
    hubRequest(`/orders/${orderId}/payments`, paymentResultSchema, {
      method: "POST",
      body: JSON.stringify({
        method,
        ...(method === "CASH" ? { tenderedMillimes } : {}),
      }),
    }),
  reprint: (orderId: string, stationId?: string) =>
    hubRequest(`/orders/${orderId}/reprint`, z.object({ created: z.number() }), {
      method: "POST",
      body: JSON.stringify(stationId ? { stationId } : {}),
    }),
  printJobs: () => hubRequest("/print-jobs", printJobsSchema),
  retryPrint: (id: string) =>
    hubRequest(`/print-jobs/${id}/retry`, z.object({ id: z.uuid(), status: z.string() }), {
      method: "POST",
    }),
  printers: () => hubRequest("/printers/status", printerStatusSchema),
};

export type { PaymentMethod, PublicOrder, Role, TableStatus };
