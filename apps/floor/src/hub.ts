import { formatMillimes, millimes, publicOrderSchema, type PublicOrder } from "@resto/shared";
import { z } from "zod";

import { loadFloorSession } from "./session.js";

const meSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  role: z.enum(["WAITER", "CASHIER", "ADMIN"]),
});

export const catalogSchema = z.object({
  categories: z.array(
    z.object({
      id: z.uuid(),
      nameFr: z.string(),
      stationKind: z.enum(["BAR", "KITCHEN"]),
      nameAr: z.string(),
      products: z.array(
        z.object({
          id: z.uuid(),
          nameFr: z.string(),
          nameAr: z.string(),
          priceMillimes: z.number().int(),
          isAvailable: z.boolean(),
          imageUrl: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
});

export const tablesSchema = z.object({
  tables: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      zone: z.string(),
      seats: z.number().int(),
      status: z.enum(["FREE", "OCCUPIED", "TO_PAY"]),
      isActive: z.boolean().optional(),
      openOrderId: z.uuid().nullable(),
      ownedByMe: z.boolean(),
    }),
  ),
});

const ordersSchema = z.object({
  orders: z.array(publicOrderSchema),
});

export function hubOrigin(): string {
  const configured = import.meta.env.VITE_HUB_URL;
  if (typeof configured === "string" && configured.length > 0) {
    return configured;
  }
  return `http://${window.location.hostname}:3000`;
}

export function money(amount: number): string {
  return formatMillimes(millimes(amount), "fr");
}

export async function hub<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const session = loadFloorSession();
  if (session) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }
  const response = await fetch(`${hubOrigin()}${path}`, { ...init, headers });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object" && "code" in body.error
        ? String(body.error.code)
        : "UNKNOWN";
    throw new Error(code);
  }
  return schema.parse(body);
}

export function loginStaff(pin: string) {
  return hub("/auth/login-staff", z.object({ token: z.string() }), {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export function me() {
  return hub("/auth/me", meSchema);
}

export function catalog() {
  return hub("/catalog", catalogSchema);
}

export function tables() {
  return hub("/tables", tablesSchema);
}

export function createFloorTable(input: { id: string; label: string; zone: string; seats: number }) {
  return hub("/tables", z.object({ id: z.uuid(), label: z.string() }), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function orders() {
  return hub("/orders?limit=100", ordersSchema);
}

export function createOrder(body: unknown) {
  return hub("/orders", publicOrderSchema, { method: "POST", body: JSON.stringify(body) });
}

export function sendOrder(id: string) {
  return hub(`/orders/${id}/send`, publicOrderSchema, { method: "POST" });
}

export function addItems(orderId: string, items: { productId: string; quantity: number; note?: string }[]) {
  return hub(`/orders/${orderId}/items`, publicOrderSchema, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export function order(id: string) {
  return hub(`/orders/${id}`, z.object({ order: publicOrderSchema }));
}

const paymentSchema = z.object({
  notice: z.string(),
  payment: z.object({
    changeMillimes: z.number().int().nullable(),
  }),
});

export function requestBill(orderId: string) {
  return hub(`/orders/${orderId}/request-bill`, publicOrderSchema, { method: "POST" });
}

export function pay(orderId: string, method: "CASH" | "CARD", tenderedMillimes?: number) {
  return hub(`/orders/${orderId}/payments`, paymentSchema, {
    method: "POST",
    body: JSON.stringify({
      method,
      ...(method === "CASH" ? { tenderedMillimes } : {}),
    }),
  });
}

const pendingSchema = z.object({
  cancellations: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      reason: z.string(),
      tableLabel: z.string(),
      productName: z.string(),
      serverName: z.string(),
    }),
  ),
});

export function pendingCancellations() {
  return hub("/cancellation-requests?status=PENDING", pendingSchema);
}

export function decideCancellation(id: string, approve: boolean) {
  return hub(`/cancellation-requests/${id}/decision`, publicOrderSchema, {
    method: "POST",
    body: JSON.stringify({ approve }),
  });
}

export function requestCancellation(orderId: string, orderItemId: string, reason: string) {
  return hub(`/orders/${orderId}/cancellation-requests`, z.object({ cancellationId: z.uuid() }), {
    method: "POST",
    body: JSON.stringify({ orderItemId, reason }),
  });
}

export function dailySpecials() {
  return hub(
    "/daily-specials",
    z.object({ businessDate: z.string(), productIds: z.array(z.uuid()) }),
  );
}

const recetteTotal = z.object({
  quantity: z.number().int(),
  revenueMillimes: z.number().int(),
});

export const recetteSchema = z.object({
  notice: z.string(),
  service: z
    .object({
      status: z.enum(["OPEN", "CLOSED"]),
      businessDate: z.string(),
      openedAt: z.string(),
      closedAt: z.string().nullable(),
    })
    .nullable(),
  products: z.array(
    z.object({
      nameFr: z.string(),
      stationKind: z.enum(["BAR", "KITCHEN"]),
      quantity: z.number().int(),
      revenueMillimes: z.number().int(),
    }),
  ),
  totals: z.object({
    all: recetteTotal,
    bar: recetteTotal,
    kitchen: recetteTotal,
  }),
});

export type ServiceRecetteReport = z.infer<typeof recetteSchema>;

export function serviceRecette() {
  return hub("/service-recette", recetteSchema);
}

export function openService() {
  return hub("/service-recette/open", recetteSchema, { method: "POST" });
}

export function closeService() {
  return hub("/service-recette/close", recetteSchema, { method: "POST" });
}

export type FloorTable = z.infer<typeof tablesSchema>["tables"][number];
export type CatalogCategory = z.infer<typeof catalogSchema>["categories"][number];
export type { PublicOrder };
