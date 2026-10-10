import type postgres from "postgres";

export interface RestaurantProfile {
  name: string;
  address: string;
  phone: string;
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
  }
}
