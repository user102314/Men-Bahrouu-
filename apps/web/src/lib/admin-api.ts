import { z } from "zod";

import { cancellationsSchema, hubRequest, ordersSchema, printJobsSchema } from "./api.js";

const settingsSchema = z.object({
  restaurant: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string(),
  }),
  defaultVatBp: z.number().int(),
  businessDayCutoffHour: z.number().int(),
  printColumns: z.number().int(),
  ticketHeader: z.string(),
  requireOpenShift: z.boolean(),
  restockOnVoid: z.boolean(),
  cashVarianceAlertMillimes: z.number().int(),
  priceCeilingMillimes: z.number().int(),
});

const periodSchema = z.object({
  revenueMillimes: z.number().int(),
  orderCount: z.number().int(),
  averageBasketMillimes: z.number().int(),
  covers: z.number().int().nullable(),
  voidCount: z.number().int(),
  voidValueMillimes: z.number().int(),
});

const dashboardSchema = periodSchema.extend({
  notice: z.string(),
  stockAlerts: z.number().int(),
  cashVariances: z.number().int(),
  previous: periodSchema,
});

const productRow = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  name_fr: z.string(),
  name_ar: z.string(),
  price_millimes: z.number().int(),
  vat_rate_bp: z.number().int(),
  is_available: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number().int(),
});

const categoryRow = z.object({
  id: z.uuid(),
  name_fr: z.string(),
  name_ar: z.string(),
  station_id: z.uuid(),
  station_kind: z.enum(["BAR", "KITCHEN"]),
  is_active: z.boolean(),
  sort_order: z.number().int(),
});

const stationRow = z.object({
  id: z.uuid(),
  kind: z.enum(["BAR", "KITCHEN"]),
  name: z.string(),
  printer_id: z.uuid(),
  fallback_station_id: z.uuid().nullable(),
});

const printerRow = z.object({
  id: z.uuid(),
  name: z.string(),
  host: z.string(),
  port: z.number().int(),
  paper_width_mm: z.number().int(),
  is_active: z.boolean(),
});

const deviceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(["TABLET", "CASHIER_PC", "PHONE", "PERSONAL"]),
  isActive: z.boolean(),
  lastSeenAt: z.string().nullable(),
});

const tableRow = z.object({
  id: z.uuid(),
  label: z.string(),
  zone: z.string(),
  seats: z.number().int(),
  status: z.enum(["FREE", "OCCUPIED", "TO_PAY"]),
  isActive: z.boolean(),
});

export type AdminProduct = {
  id: string;
  categoryId: string;
  nameFr: string;
  nameAr: string;
  priceMillimes: number;
  vatRateBp: number;
  isAvailable: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type AdminCategory = {
  id: string;
  nameFr: string;
  nameAr: string;
  stationId: string;
  stationKind: "BAR" | "KITCHEN";
  isActive: boolean;
  sortOrder: number;
};

function query(path: string, from: string, to: string): string {
  return `${path}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

export const adminApi = {
  settings: () => hubRequest("/settings", settingsSchema),
  putSettings: (body: unknown) =>
    hubRequest("/settings", settingsSchema, { method: "PUT", body: JSON.stringify(body) }),
  dashboard: (from: string, to: string) => hubRequest(query("/reports/dashboard", from, to), dashboardSchema),
  byHour: (from: string, to: string) =>
    hubRequest(
      query("/reports/sales/by-hour", from, to),
      z.object({
        notice: z.string(),
        points: z.array(z.object({ hour: z.coerce.number(), revenue_millimes: z.coerce.number() })),
      }),
    ),
  byDay: (from: string, to: string) =>
    hubRequest(
      query("/reports/sales/by-day", from, to),
      z.object({
        notice: z.string(),
        points: z.array(z.object({ day: z.string(), revenue_millimes: z.coerce.number() })),
      }),
    ),
  topProducts: (from: string, to: string) =>
    hubRequest(
      query("/reports/products/top", from, to),
      z.object({
        notice: z.string(),
        products: z.array(
          z.object({ name: z.string(), quantity: z.coerce.number(), revenue_millimes: z.coerce.number() }),
        ),
      }),
    ),
  payments: (from: string, to: string) =>
    hubRequest(
      query("/reports/payments", from, to),
      z.object({
        notice: z.string(),
        methods: z.array(
          z.object({ method: z.string(), amount_millimes: z.coerce.number(), count: z.coerce.number() }),
        ),
      }),
    ),
  stations: (from: string, to: string) =>
    hubRequest(
      query("/reports/stations", from, to),
      z.object({
        notice: z.string(),
        stations: z.array(
          z.object({ kind: z.string(), quantity: z.coerce.number(), revenue_millimes: z.coerce.number() }),
        ),
      }),
    ),
  foodCost: () =>
    hubRequest(
      "/reports/food-cost",
      z.object({
        notice: z.string(),
        products: z.array(
          z.object({
            name: z.string(),
            priceMillimes: z.number().int(),
            costMillimes: z.number().int(),
            marginMillimes: z.number().int(),
          }),
        ),
      }),
    ),
  products: async (): Promise<AdminProduct[]> => {
    const body = await hubRequest("/admin/products", z.object({ products: z.array(productRow) }));
    return body.products.map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      nameFr: row.name_fr,
      nameAr: row.name_ar,
      priceMillimes: row.price_millimes,
      vatRateBp: row.vat_rate_bp,
      isAvailable: row.is_available,
      isActive: row.is_active,
      sortOrder: row.sort_order,
    }));
  },
  saveProduct: (id: string, body: unknown, creating: boolean) =>
    hubRequest(creating ? "/products" : `/products/${id}`, z.unknown(), {
      method: creating ? "POST" : "PATCH",
      body: JSON.stringify(creating ? { id, ...(body as object) } : body),
    }),
  availability: (id: string, isAvailable: boolean) =>
    hubRequest(`/products/${id}/availability`, z.unknown(), {
      method: "PATCH",
      body: JSON.stringify({ isAvailable }),
    }),
  categories: async (): Promise<AdminCategory[]> => {
    const body = await hubRequest("/admin/categories", z.object({ categories: z.array(categoryRow) }));
    return body.categories.map((row) => ({
      id: row.id,
      nameFr: row.name_fr,
      nameAr: row.name_ar,
      stationId: row.station_id,
      stationKind: row.station_kind,
      isActive: row.is_active,
      sortOrder: row.sort_order,
    }));
  },
  saveCategory: (id: string, body: unknown, creating: boolean) =>
    hubRequest(creating ? "/categories" : `/categories/${id}`, z.unknown(), {
      method: creating ? "POST" : "PATCH",
      body: JSON.stringify(creating ? { id, ...(body as object) } : body),
    }),
  reorderCategories: (ids: string[]) =>
    hubRequest("/categories/reorder", z.unknown(), { method: "POST", body: JSON.stringify({ ids }) }),
  stationList: async () => {
    const body = await hubRequest("/admin/stations", z.object({ stations: z.array(stationRow) }));
    return body.stations.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      printerId: row.printer_id,
      fallbackStationId: row.fallback_station_id,
    }));
  },
  saveStation: (id: string, body: unknown) =>
    hubRequest(`/stations/${id}`, z.unknown(), { method: "PATCH", body: JSON.stringify(body) }),
  printers: async () => {
    const body = await hubRequest("/admin/printers", z.object({ printers: z.array(printerRow) }));
    return body.printers.map((row) => ({
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      paperWidthMm: row.paper_width_mm,
      isActive: row.is_active,
    }));
  },
  savePrinter: (id: string, body: unknown, creating: boolean) =>
    hubRequest(creating ? "/printers" : `/printers/${id}`, z.unknown(), {
      method: creating ? "POST" : "PATCH",
      body: JSON.stringify(creating ? { id, ...(body as object) } : body),
    }),
  testPrinter: (id: string) =>
    hubRequest(`/printers/${id}/test`, z.object({ ok: z.boolean(), error: z.string().optional() }), {
      method: "POST",
    }),
  recipe: (productId: string) =>
    hubRequest(
      `/products/${productId}/ingredients`,
      z.object({
        ingredients: z.array(z.object({ stock_item_id: z.uuid(), quantity_base: z.number().int() })),
      }),
    ),
  setRecipe: (productId: string, ingredients: { stockItemId: string; quantityBase: number }[]) =>
    hubRequest(`/products/${productId}/ingredients`, z.unknown(), {
      method: "PUT",
      body: JSON.stringify({ ingredients }),
    }),
  stockItems: () =>
    hubRequest(
      "/stock-items",
      z.object({
        items: z.array(
          z.object({
            id: z.uuid(),
            name_fr: z.string(),
            name_ar: z.string(),
            base_unit: z.enum(["G", "ML", "PIECE"]),
            is_active: z.boolean(),
          }),
        ),
      }),
    ),
  tables: () => hubRequest("/tables", z.object({ tables: z.array(tableRow) })),
  saveTable: (id: string, body: unknown, creating: boolean) =>
    hubRequest(creating ? "/tables" : `/tables/${id}`, z.unknown(), {
      method: creating ? "POST" : "PATCH",
      body: JSON.stringify(creating ? { id, ...(body as object) } : body),
    }),
  renameZone: (from: string, to: string) =>
    hubRequest("/tables/zones", z.unknown(), { method: "POST", body: JSON.stringify({ from, to }) }),
  devices: () => hubRequest("/devices", z.array(deviceSchema)),
  createDevice: (name: string, type: "TABLET" | "CASHIER_PC" | "PHONE" | "PERSONAL") =>
    hubRequest(
      "/devices",
      z.object({
        id: z.uuid(),
        name: z.string(),
        type: z.enum(["TABLET", "CASHIER_PC", "PHONE", "PERSONAL"]),
        token: z.string(),
      }),
      { method: "POST", body: JSON.stringify({ name, type }) },
    ),
  revokeDevice: (id: string) => hubRequest(`/devices/${id}/revoke`, z.unknown(), { method: "POST" }),
  openShifts: () =>
    hubRequest("/cash-shifts?status=OPEN", z.object({ shifts: z.array(z.object({ id: z.string(), status: z.string() })) })),
  orders: (status?: string) =>
    hubRequest(status ? `/orders?limit=100&status=${status}` : "/orders?limit=100", ordersSchema),
  cancellations: () => hubRequest("/cancellation-requests?status=PENDING", cancellationsSchema),
  printJobs: () => hubRequest("/print-jobs", printJobsSchema),
};

export type DashboardReport = z.infer<typeof dashboardSchema>;
export type SiteSettingsView = z.infer<typeof settingsSchema>;
