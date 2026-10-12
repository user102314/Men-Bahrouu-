import type postgres from "postgres";

export interface RestaurantProfile {
  name: string;
  address: string;
  phone: string;
}

export interface DailySpecials {
  businessDate: string;
  productIds: string[];
}

export interface ServiceRecette {
  status: "OPEN" | "CLOSED";
  businessDate: string;
  openedAt: string;
  closedAt: string | null;
}

export interface SiteSettings {
  restaurant: RestaurantProfile;
  defaultVatBp: number;
  businessDayCutoffHour: number;
  printColumns: number;
  ticketHeader: string;
  requireOpenShift: boolean;
  restockOnVoid: boolean;
  cashVarianceAlertMillimes: number;
  priceCeilingMillimes: number;
  dailySpecials: DailySpecials;
  serviceRecette: ServiceRecette;
}

const cache = new Map<string, SiteSettings>();

export function invalidateSettings(siteId: string): void {
  cache.delete(siteId);
}

export function defaultSettings(fallback: {
  cutoffHour: number;
  printColumns: number;
  vatBp: number;
  name: string;
}): SiteSettings {
  return {
    restaurant: { name: fallback.name, address: "", phone: "" },
    defaultVatBp: fallback.vatBp,
    businessDayCutoffHour: fallback.cutoffHour,
    printColumns: fallback.printColumns,
    ticketHeader: "",
    requireOpenShift: false,
    restockOnVoid: false,
    cashVarianceAlertMillimes: 0,
    priceCeilingMillimes: 1_000_000,
    dailySpecials: { businessDate: "", productIds: [] },
    serviceRecette: { status: "CLOSED", businessDate: "", openedAt: "", closedAt: null },
  };
}

export async function loadSettings(
  sql: postgres.Sql,
  siteId: string,
  fallback: SiteSettings,
): Promise<SiteSettings> {
  const cached = cache.get(siteId);
  if (cached) {
    return cached;
  }
  const rows = await sql<{ key: string; value: unknown }[]>`
    select key, value from settings where site_id = ${siteId}
  `;
  const merged = { ...fallback, restaurant: { ...fallback.restaurant } };
  for (const row of rows) {
    assignSetting(merged, row.key, row.value);
  }
  cache.set(siteId, merged);
  return merged;
}

export function assignSetting(target: SiteSettings, key: string, value: unknown): void {
  if (key === "restaurant" && value && typeof value === "object") {
    target.restaurant = value as RestaurantProfile;
    return;
  }
  if (key === "defaultVatBp" && typeof value === "number") {
    target.defaultVatBp = value;
  } else if (key === "businessDayCutoffHour" && typeof value === "number") {
    target.businessDayCutoffHour = value;
  } else if (key === "printColumns" && typeof value === "number") {
    target.printColumns = value;
  } else if (key === "ticketHeader" && typeof value === "string") {
    target.ticketHeader = value;
  } else if (key === "requireOpenShift" && typeof value === "boolean") {
    target.requireOpenShift = value;
  } else if (key === "restockOnVoid" && typeof value === "boolean") {
    target.restockOnVoid = value;
  } else if (key === "cashVarianceAlertMillimes" && typeof value === "number") {
    target.cashVarianceAlertMillimes = value;
  } else if (key === "priceCeilingMillimes" && typeof value === "number") {
    target.priceCeilingMillimes = value;
  } else if (key === "dailySpecials" && value && typeof value === "object") {
    const record = value as { businessDate?: unknown; productIds?: unknown };
    target.dailySpecials = {
      businessDate: typeof record.businessDate === "string" ? record.businessDate : "",
      productIds: Array.isArray(record.productIds)
        ? record.productIds.filter((id): id is string => typeof id === "string").slice(0, 40)
        : [],
    };
  } else if (key === "serviceRecette" && value && typeof value === "object") {
    const record = value as { status?: unknown; businessDate?: unknown; openedAt?: unknown; closedAt?: unknown };
    target.serviceRecette = {
      status: record.status === "OPEN" ? "OPEN" : "CLOSED",
      businessDate: typeof record.businessDate === "string" ? record.businessDate : "",
      openedAt: typeof record.openedAt === "string" ? record.openedAt : "",
      closedAt: typeof record.closedAt === "string" ? record.closedAt : null,
    };
  }
}
