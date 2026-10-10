import { randomInt } from "node:crypto";

import {
  lineCostMillimes,
  newId,
  vatPortionFromGross,
  weightedAverageCostPer1000,
  type PaymentMethod,
  type Role,
} from "@resto/shared";
import type postgres from "postgres";

import { DomainError } from "../../domain/ordering/errors.js";
import { hashSecret } from "../auth/argon2-hasher.js";
import { isPrivatePrinterHost } from "./stock-effects.js";
import { defaultSettings, invalidateSettings, loadSettings, type SiteSettings } from "./settings-store.js";

type Tx = postgres.TransactionSql<Record<string, never>>;

interface Actor {
  id: string;
  role: Role;
  deviceId: string | null;
}

interface LiveEvent {
  name: string;
  serverId: string;
  payload: unknown;
}

const NOTICE = "enregistrement de gestion, non fiscal";

export function createAdminStore(
  sql: postgres.Sql,
  options: { siteId: string; cutoffHour: number; printColumns: number; vatBp: number },
) {
  const fallback = defaultSettings({
    cutoffHour: options.cutoffHour,
    printColumns: options.printColumns,
    vatBp: options.vatBp,
    name: "Men Bahrouu",
  });
  const siteId = options.siteId;

  return {
    settings: () => loadSettings(sql, siteId, fallback),
    putSettings: (
      actor: Actor,
      patch: { [K in keyof SiteSettings]?: SiteSettings[K] | undefined },
    ) => putSettings(sql, siteId, actor, fallback, patch),
    createCategory: (actor: Actor, input: { id: string; nameFr: string; nameAr: string; stationId: string }) =>
      mutate(sql, (tx) => insertCategory(tx, siteId, actor, input)),
    updateCategory: (
      actor: Actor,
      id: string,
      patch: { nameFr?: string | undefined; nameAr?: string | undefined; stationId?: string | undefined },
    ) => mutate(sql, (tx) => patchCategory(tx, siteId, actor, id, patch)),
    reorderCategories: (actor: Actor, ids: string[]) => mutate(sql, (tx) => reorder(tx, siteId, actor, "categories", ids)),
    createProduct: (
      actor: Actor,
      input: {
        id: string;
        categoryId: string;
        nameFr: string;
        nameAr: string;
        priceMillimes: number;
        vatRateBp?: number | undefined;
        confirmHighPrice?: boolean | undefined;
      },
    ) => mutate(sql, (tx) => insertProduct(tx, siteId, actor, fallback, input)),
    updateProduct: (
      actor: Actor,
      id: string,
      patch: {
        categoryId?: string | undefined;
        nameFr?: string | undefined;
        nameAr?: string | undefined;
        priceMillimes?: number | undefined;
        vatRateBp?: number | undefined;
        confirmHighPrice?: boolean | undefined;
        isActive?: boolean | undefined;
      },
    ) => mutate(sql, (tx) => patchProduct(tx, siteId, actor, fallback, id, patch)),
    reorderProducts: (actor: Actor, ids: string[]) => mutate(sql, (tx) => reorder(tx, siteId, actor, "products", ids)),
    setAvailability: (actor: Actor, id: string, isAvailable: boolean) =>
      mutate(sql, (tx) => setAvailability(tx, siteId, actor, id, isAvailable)),
    listProducts: () =>
      sql`
        select id, category_id, name_fr, name_ar, price_millimes, vat_rate_bp, is_available, is_active, sort_order
        from products where site_id = ${siteId} order by sort_order, name_fr
      `,
    createTable: (actor: Actor, input: { id: string; label: string; zone: string; seats: number }) =>
      mutate(sql, (tx) => insertTable(tx, siteId, actor, input)),
    updateTable: (
      actor: Actor,
      id: string,
      patch: { label?: string | undefined; zone?: string | undefined; seats?: number | undefined; isActive?: boolean | undefined },
    ) => mutate(sql, (tx) => patchTable(tx, siteId, actor, id, patch)),
    renameZone: (actor: Actor, from: string, to: string) => mutate(sql, (tx) => renameZone(tx, siteId, actor, from, to)),
    createPrinter: (actor: Actor, input: { id: string; name: string; host: string; port: number; paperWidthMm?: number | undefined }) =>
      mutate(sql, (tx) => insertPrinter(tx, siteId, actor, input)),
    updatePrinter: (
      actor: Actor,
      id: string,
      patch: { name?: string | undefined; host?: string | undefined; port?: number | undefined; paperWidthMm?: number | undefined; isActive?: boolean | undefined },
    ) => mutate(sql, (tx) => patchPrinter(tx, siteId, actor, id, patch)),
    updateStation: (
      actor: Actor,
      id: string,
      patch: { printerId?: string | undefined; fallbackStationId?: string | undefined | null; name?: string | undefined },
    ) => mutate(sql, (tx) => patchStation(tx, siteId, actor, id, patch)),
    listUsers: () =>
      sql`
        select id, display_name, role, email, is_active from users
        where site_id = ${siteId} order by display_name
      `,
    createUser: (actor: Actor, input: { id: string; displayName: string; role: Role; email?: string | undefined; password?: string | undefined }) =>
      createUser(sql, siteId, actor, input),
    updateUser: (actor: Actor, id: string, patch: { displayName?: string | undefined; email?: string | undefined }) =>
      mutate(sql, (tx) => patchUser(tx, siteId, actor, id, patch)),
    resetPin: (actor: Actor, id: string) => resetPin(sql, siteId, actor, id),
    setActive: (actor: Actor, id: string, isActive: boolean) =>
      mutate(sql, (tx) => setActive(tx, siteId, actor, id, isActive)),
    setRole: (actor: Actor, id: string, role: Role) => mutate(sql, (tx) => setRole(tx, siteId, actor, id, role)),
    clockIn: (actor: Actor, now: Date) => mutate(sql, (tx) => clock(tx, siteId, actor, now, "in")),
    clockOut: (actor: Actor, now: Date) => mutate(sql, (tx) => clock(tx, siteId, actor, now, "out")),
    listAttendance: (actor: Actor, filter: { from?: string | undefined; to?: string | undefined; userId?: string | undefined }) =>
      listAttendance(sql, siteId, actor, filter),
    editAttendance: (
      actor: Actor,
      id: string,
      patch: { clockIn?: string | undefined; clockOut?: string | undefined | null; reason: string },
    ) => mutate(sql, (tx) => editAttendance(tx, siteId, actor, id, patch)),
    getStaffShifts: (weekStart: string) => getStaffShifts(sql, siteId, weekStart),
    putStaffShifts: (
      actor: Actor,
      weekStart: string,
      slots: { userId: string; workDate: string; startTime: string; endTime: string; note?: string | undefined }[],
    ) => mutate(sql, (tx) => putStaffShifts(tx, siteId, actor, weekStart, slots)),
    listStock: () => sql`select * from stock_items where site_id = ${siteId} order by code`,
    stockMovements: (id: string) =>
      sql`
        select * from stock_movements
        where site_id = ${siteId} and stock_item_id = ${id} order by created_at
      `,
    createStockItem: (
      actor: Actor,
      input: {
        id: string;
        code: string;
        nameFr: string;
        nameAr?: string | undefined;
        baseUnit: "G" | "ML" | "PIECE";
        minThresholdBase: number;
        supplierId?: string | undefined;
      },
    ) => mutate(sql, (tx) => insertStockItem(tx, siteId, actor, input)),
    updateStockItem: (
      actor: Actor,
      id: string,
      patch: { code?: string | undefined; nameFr?: string | undefined; nameAr?: string | undefined; minThresholdBase?: number | undefined; supplierId?: string | undefined; isActive?: boolean | undefined },
    ) => mutate(sql, (tx) => patchStockItem(tx, siteId, actor, id, patch)),
    setRecipe: (actor: Actor, productId: string, ingredients: { stockItemId: string; quantityBase: number }[]) =>
      mutate(sql, (tx) => setRecipe(tx, siteId, actor, productId, ingredients)),
    manualMovement: (
      actor: Actor,
      input: { stockItemId: string; deltaBase: number; reason: "WASTE" | "CORRECTION"; note: string },
    ) => mutate(sql, (tx) => manualMovement(tx, siteId, actor, input)),
    stockAlerts: () =>
      sql`
        select id, code, name_fr, quantity_base, min_threshold_base from stock_items
        where site_id = ${siteId} and is_active and quantity_base <= min_threshold_base
        order by code
      `,
    takeInventory: (
      actor: Actor,
      input: { note?: string | undefined; lines: { stockItemId: string; countedBase: number }[] },
    ) => mutate(sql, (tx) => takeInventory(tx, siteId, actor, input)),
    listSuppliers: () => sql`select * from suppliers where site_id = ${siteId} order by name`,
    createSupplier: (actor: Actor, input: { id: string; name: string; phone?: string | undefined; note?: string | undefined }) =>
      mutate(sql, (tx) => insertSupplier(tx, siteId, actor, input)),
    updateSupplier: (
      actor: Actor,
      id: string,
      patch: { name?: string | undefined; phone?: string | undefined; note?: string | undefined; isActive?: boolean | undefined },
    ) => mutate(sql, (tx) => patchSupplier(tx, siteId, actor, id, patch)),
    createPurchase: (
      actor: Actor,
      input: {
        id: string;
        supplierId: string;
        invoiceRef?: string | undefined;
        purchaseDate: string;
        lines: { stockItemId: string; quantityBase: number; totalCostMillimes: number }[];
      },
    ) => mutate(sql, (tx) => insertPurchase(tx, siteId, actor, input)),
    updatePurchase: (
      actor: Actor,
      id: string,
      input: {
        supplierId?: string | undefined;
        invoiceRef?: string | undefined;
        purchaseDate?: string | undefined;
        lines?: { stockItemId: string; quantityBase: number; totalCostMillimes: number }[] | undefined;
      },
    ) => mutate(sql, (tx) => patchPurchase(tx, siteId, actor, id, input)),
    receivePurchase: (actor: Actor, id: string, now: Date) => mutate(sql, (tx) => receivePurchase(tx, siteId, actor, id, now)),
    cancelPurchase: (actor: Actor, id: string) => mutate(sql, (tx) => cancelPurchase(tx, siteId, actor, id)),
    markPurchasePaid: (actor: Actor, id: string) => mutate(sql, (tx) => markPurchasePaid(tx, siteId, actor, id)),
    createExpense: (
      actor: Actor,
      input: {
        id: string;
        category: string;
        amountMillimes: number;
        expenseDate: string;
        note?: string | undefined;
        supplierId?: string | undefined;
        payFromShiftId?: string | undefined;
      },
    ) => mutate(sql, (tx) => insertExpense(tx, siteId, actor, input)),
    updateExpense: (actor: Actor, id: string, patch: { note?: string | undefined; isVoid?: boolean | undefined }) =>
      mutate(sql, (tx) => patchExpense(tx, siteId, actor, id, patch)),
    listExpenses: (from: string, to: string, category?: string | undefined) =>
      sql`
        select * from expenses
        where site_id = ${siteId} and expense_date between ${from} and ${to}
          and (${category ?? null}::text is null or category = ${category ?? null}::expense_category)
        order by expense_date
      `,
    openShift: (actor: Actor, input: { id: string; openingFloatMillimes: number }, now: Date) =>
      mutate(sql, (tx) => openShift(tx, siteId, actor, input, now)),
    cashMovement: (
      actor: Actor,
      shiftId: string,
      input: { type: "PAY_IN" | "PAY_OUT"; amountMillimes: number; reason: string; expenseId?: string | undefined },
    ) => mutate(sql, (tx) => addCashMovement(tx, siteId, actor, shiftId, input)),
    closeShift: (actor: Actor, id: string, input: { countedMillimes: number; note?: string | undefined }, now: Date) =>
      mutate(sql, (tx) => closeShift(tx, siteId, actor, fallback, id, input, now)),
    noteShift: (actor: Actor, id: string, note: string) => mutate(sql, (tx) => noteShift(tx, siteId, actor, id, note)),
    listShifts: (from?: string | undefined, to?: string | undefined, status?: string | undefined) =>
      sql`
        select * from cash_shifts
        where site_id = ${siteId}
          and (${from ?? null}::timestamptz is null or opened_at >= ${from ?? null}::timestamptz)
          and (${to ?? null}::timestamptz is null or opened_at < ${to ?? null}::timestamptz)
          and (${status ?? null}::text is null or status = ${status ?? null}::shift_status)
        order by opened_at desc
      `,
    currentShift: (deviceId: string) =>
      sql`
        select * from cash_shifts
        where site_id = ${siteId} and device_id = ${deviceId} and status = 'OPEN'
      `,
    pay: (
      actor: Actor,
      orderId: string,
      input: { method: PaymentMethod; tenderedMillimes?: number | undefined },
      now: Date,
    ) => mutate(sql, (tx) => pay(tx, siteId, actor, fallback, orderId, input, now)),
    notice: NOTICE,
  };
}

async function mutate<T>(sql: postgres.Sql, work: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => work(tx))) as T;
}

async function track(
  tx: Tx,
  siteId: string,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx`
    insert into audit_log (id, site_id, actor_user_id, device_id, action, entity_type, entity_id, before, after)
    values (
      ${newId()}, ${siteId}, ${actor.id}, ${actor.deviceId}, ${action}, ${entityType}, ${entityId},
      ${before == null ? null : tx.json(before as postgres.JSONValue)},
      ${after == null ? null : tx.json(after as postgres.JSONValue)}
    )
  `;
  await tx`
    insert into sync_outbox (id, site_id, entity_type, entity_id, op, payload)
    values (
      ${newId()}, ${siteId}, ${entityType}, ${entityId}, 'UPSERT',
      ${tx.json({ action, entityId } as postgres.JSONValue)}
    )
  `;
}

async function putSettings(
  sql: postgres.Sql,
  siteId: string,
  actor: Actor,
  fallback: SiteSettings,
  patch: { [K in keyof SiteSettings]?: SiteSettings[K] | undefined },
): Promise<{ settings: SiteSettings; events: LiveEvent[] }> {
  const current = await loadSettings(sql, siteId, fallback);
  const keys = Object.keys(patch) as (keyof SiteSettings)[];
  await sql.begin(async (tx) => {
    for (const key of keys) {
      const value = patch[key];
      if (value === undefined) {
        continue;
      }
      await tx`
        insert into settings (site_id, key, value, updated_by)
        values (${siteId}, ${key}, ${tx.json(value as postgres.JSONValue)}, ${actor.id})
        on conflict (site_id, key) do update
        set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
      `;
      await track(tx, siteId, actor, "settings.updated", "settings", siteId, { [key]: current[key] }, { [key]: value });
    }
  });
  invalidateSettings(siteId);
  const settings = await loadSettings(sql, siteId, fallback);
  return { settings, events: [{ name: "settings.updated", serverId: "", payload: { keys } }] };
}

async function insertCategory(
  tx: Tx,
  siteId: string,
  actor: Actor,
  input: { id: string; nameFr: string; nameAr: string; stationId: string },
): Promise<unknown> {
  await assertSameSite(tx, "stations", input.stationId, siteId);
  await tx`
    insert into categories (id, site_id, name_fr, name_ar, station_id)
    values (${input.id}, ${siteId}, ${input.nameFr}, ${input.nameAr}, ${input.stationId})
  `;
  await track(tx, siteId, actor, "category.created", "category", input.id, null, input);
  return input;
}

async function patchCategory(
  tx: Tx,
  siteId: string,
  actor: Actor,
  id: string,
  patch: { nameFr?: string | undefined; nameAr?: string | undefined; stationId?: string | undefined },
): Promise<unknown> {
  const beforeRows = await tx<{ name_fr: string; station_id: string }[]>`
    select name_fr, station_id from categories where id = ${id} and site_id = ${siteId}
  `;
  const before = beforeRows[0];
  if (!before) {
    throw new DomainError("NOT_FOUND");
  }
  if (patch.stationId) {
    await assertSameSite(tx, "stations", patch.stationId, siteId);
  }
  await tx`
    update categories set
      name_fr = coalesce(${patch.nameFr ?? null}, name_fr),
      name_ar = coalesce(${patch.nameAr ?? null}, name_ar),
      station_id = coalesce(${patch.stationId ?? null}, station_id),
      updated_at = now()
    where id = ${id} and site_id = ${siteId}
  `;
  await track(tx, siteId, actor, "category.updated", "category", id, before, patch);
  return patch;
}

async function reorder(tx: Tx, siteId: string, actor: Actor, table: "categories" | "products", ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    if (table === "categories") {
      await tx`update categories set sort_order = ${index}, updated_at = now() where id = ${id} and site_id = ${siteId}`;
    } else {
      await tx`update products set sort_order = ${index}, updated_at = now() where id = ${id} and site_id = ${siteId}`;
    }
  }
  await track(tx, siteId, actor, `${table}.reordered`, table, siteId, null, { ids });
}

async function insertProduct(
  tx: Tx,
  siteId: string,
  actor: Actor,
  fallback: SiteSettings,
  input: {
    id: string;
    categoryId: string;
    nameFr: string;
    nameAr: string;
    priceMillimes: number;
    vatRateBp?: number | undefined;
    confirmHighPrice?: boolean | undefined;
  },
): Promise<unknown> {
  await assertPrice(tx, siteId, fallback, input.priceMillimes, input.confirmHighPrice === true);
  await assertSameSite(tx, "categories", input.categoryId, siteId);
  const vat = input.vatRateBp ?? fallback.defaultVatBp;
  await tx`
    insert into products (id, site_id, category_id, name_fr, name_ar, price_millimes, vat_rate_bp)
    values (${input.id}, ${siteId}, ${input.categoryId}, ${input.nameFr}, ${input.nameAr}, ${input.priceMillimes}, ${vat})
  `;
  await track(tx, siteId, actor, "product.created", "product", input.id, null, input);
  return { ...input, vatRateBp: vat, isActive: true, isAvailable: true };
}

async function patchProduct(
  tx: Tx,
  siteId: string,
  actor: Actor,
  fallback: SiteSettings,
  id: string,
  patch: {
    categoryId?: string | undefined;
    nameFr?: string | undefined;
    nameAr?: string | undefined;
    priceMillimes?: number | undefined;
    vatRateBp?: number | undefined;
    confirmHighPrice?: boolean | undefined;
    isActive?: boolean | undefined;
  },
): Promise<unknown> {
  const rows = await tx<{ price_millimes: number; name_fr: string }[]>`
    select price_millimes, name_fr from products where id = ${id} and site_id = ${siteId}
  `;
  const before = rows[0];
  if (!before) {
    throw new DomainError("NOT_FOUND");
  }
  if (patch.priceMillimes !== undefined) {
    await assertPrice(tx, siteId, fallback, patch.priceMillimes, patch.confirmHighPrice === true);
  }
  await tx`
    update products set
      category_id = coalesce(${patch.categoryId ?? null}, category_id),
      name_fr = coalesce(${patch.nameFr ?? null}, name_fr),
      name_ar = coalesce(${patch.nameAr ?? null}, name_ar),
      price_millimes = coalesce(${patch.priceMillimes ?? null}, price_millimes),
      vat_rate_bp = coalesce(${patch.vatRateBp ?? null}, vat_rate_bp),
      is_active = coalesce(${patch.isActive ?? null}, is_active),
      updated_at = now()
    where id = ${id} and site_id = ${siteId}
  `;
  await track(tx, siteId, actor, "product.updated", "product", id, before, patch);
  return patch;
}

async function setAvailability(tx: Tx, siteId: string, actor: Actor, id: string, isAvailable: boolean): Promise<LiveEvent> {
  const rows = await tx<{ id: string }[]>`
    update products set is_available = ${isAvailable}, updated_at = now()
    where id = ${id} and site_id = ${siteId} returning id
  `;
  if (!rows[0]) {
    throw new DomainError("NOT_FOUND");
  }
  const payload = { version: 1, productId: id, isAvailable };
  await track(tx, siteId, actor, "product.availability", "product", id, null, payload);
  return { name: "catalog.updated", serverId: "", payload };
}

async function assertPrice(tx: Tx, siteId: string, fallback: SiteSettings, price: number, confirmed: boolean): Promise<void> {
  const rows = await tx<{ value: number }[]>`
    select value from settings where site_id = ${siteId} and key = 'priceCeilingMillimes'
  `;
  const ceiling = typeof rows[0]?.value === "number" ? rows[0].value : fallback.priceCeilingMillimes;
  if (price >= ceiling && !confirmed) {
    throw new DomainError("PRICE_CONFIRMATION");
  }
}

async function insertTable(tx: Tx, siteId: string, actor: Actor, input: { id: string; label: string; zone: string; seats: number }) {
  await tx`
    insert into floor_tables (id, site_id, label, zone, seats) values (${input.id}, ${siteId}, ${input.label}, ${input.zone}, ${input.seats})
  `;
  await track(tx, siteId, actor, "table.created", "floor_table", input.id, null, input);
  return input;
}

async function patchTable(
  tx: Tx,
  siteId: string,
  actor: Actor,
  id: string,
  patch: { label?: string | undefined; zone?: string | undefined; seats?: number | undefined; isActive?: boolean | undefined },
) {
  if (patch.isActive === false) {
    const open = await tx<{ id: string }[]>`
      select id from orders where site_id = ${siteId} and table_id = ${id} and status in ('DRAFT','SENT','SERVED')
    `;
    if (open[0]) {
      throw new DomainError("OPEN_ORDER");
    }
  }
  const rows = await tx<{ id: string }[]>`
    update floor_tables set
      label = coalesce(${patch.label ?? null}, label),
      zone = coalesce(${patch.zone ?? null}, zone),
      seats = coalesce(${patch.seats ?? null}, seats),
      is_active = coalesce(${patch.isActive ?? null}, is_active),
      updated_at = now()
    where id = ${id} and site_id = ${siteId} returning id
  `;
  if (!rows[0]) {
    throw new DomainError("NOT_FOUND");
  }
  await track(tx, siteId, actor, "table.updated", "floor_table", id, null, patch);
  return patch;
}

async function renameZone(tx: Tx, siteId: string, actor: Actor, from: string, to: string) {
  await tx`update floor_tables set zone = ${to}, updated_at = now() where site_id = ${siteId} and zone = ${from}`;
  await track(tx, siteId, actor, "zone.renamed", "floor_table", siteId, { from }, { to });
  return { from, to };
}

async function insertPrinter(
  tx: Tx,
  siteId: string,
  actor: Actor,
  input: { id: string; name: string; host: string; port: number; paperWidthMm?: number | undefined },
) {
  if (!isPrivatePrinterHost(input.host)) {
    throw new DomainError("HOST_NOT_PRIVATE");
  }
  await tx`
    insert into printers (id, site_id, name, host, port, paper_width_mm)
    values (${input.id}, ${siteId}, ${input.name}, ${input.host}, ${input.port}, ${input.paperWidthMm ?? 80})
  `;
  await track(tx, siteId, actor, "printer.created", "printer", input.id, null, input);
  return input;
}

async function patchPrinter(
  tx: Tx,
  siteId: string,
  actor: Actor,
  id: string,
  patch: { name?: string | undefined; host?: string | undefined; port?: number | undefined; paperWidthMm?: number | undefined; isActive?: boolean | undefined },
) {
  if (patch.host && !isPrivatePrinterHost(patch.host)) {
    throw new DomainError("HOST_NOT_PRIVATE");
  }
  const rows = await tx<{ id: string }[]>`
    update printers set
      name = coalesce(${patch.name ?? null}, name),
      host = coalesce(${patch.host ?? null}, host),
      port = coalesce(${patch.port ?? null}, port),
      paper_width_mm = coalesce(${patch.paperWidthMm ?? null}, paper_width_mm),
      is_active = coalesce(${patch.isActive ?? null}, is_active),
      updated_at = now()
    where id = ${id} and site_id = ${siteId} returning id
  `;
  if (!rows[0]) {
    throw new DomainError("NOT_FOUND");
  }
  await track(tx, siteId, actor, "printer.updated", "printer", id, null, patch);
  return patch;
}

async function patchStation(
  tx: Tx,
  siteId: string,
  actor: Actor,
  id: string,
  patch: { printerId?: string | undefined; fallbackStationId?: string | undefined | null; name?: string | undefined },
) {
  if (patch.printerId) {
    await assertSameSite(tx, "printers", patch.printerId, siteId);
  }
  const rows = await tx<{ id: string }[]>`
    update stations set
      name = coalesce(${patch.name ?? null}, name),
      printer_id = coalesce(${patch.printerId ?? null}, printer_id),
      updated_at = now()
    where id = ${id} and site_id = ${siteId} returning id
  `;
  if (patch.fallbackStationId !== undefined) {
    await tx`
      update stations set fallback_station_id = ${patch.fallbackStationId}
      where id = ${id} and site_id = ${siteId}
    `;
  }
  if (!rows[0]) {
    throw new DomainError("NOT_FOUND");
  }
  await track(tx, siteId, actor, "station.updated", "station", id, null, patch);
  return patch;
}

async function createUser(
  sql: postgres.Sql,
  siteId: string,
  actor: Actor,
  input: { id: string; displayName: string; role: Role; email?: string | undefined; password?: string | undefined },
): Promise<{ id: string; pin?: string | undefined }> {
  const pin = input.role === "ADMIN" ? undefined : String(randomInt(1000, 10000));
  const passwordHash = input.password ? await hashSecret(input.password) : null;
  const pinHash = pin ? await hashSecret(pin) : null;
  if (input.role === "ADMIN" && (!input.email || !passwordHash)) {
    throw new DomainError("INVALID_TRANSITION");
  }
  await sql.begin(async (tx) => {
    await tx`
      insert into users (id, site_id, display_name, role, email, password_hash, pin_hash)
      values (
        ${input.id}, ${siteId}, ${input.displayName}, ${input.role}::user_role,
        ${input.email ?? null}, ${passwordHash}, ${pinHash}
      )
    `;
    await track(tx, siteId, actor, "user.created", "user", input.id, null, {
      displayName: input.displayName,
      role: input.role,
    });
  });
  return pin ? { id: input.id, pin } : { id: input.id };
}

async function patchUser(tx: Tx, siteId: string, actor: Actor, id: string, patch: { displayName?: string | undefined; email?: string | undefined }) {
  const rows = await tx<{ id: string }[]>`
    update users set
      display_name = coalesce(${patch.displayName ?? null}, display_name),
      email = coalesce(${patch.email ?? null}, email),
      updated_at = now()
    where id = ${id} and site_id = ${siteId} returning id
  `;
  if (!rows[0]) {
    throw new DomainError("NOT_FOUND");
  }
  await track(tx, siteId, actor, "user.updated", "user", id, null, patch);
  return patch;
}

async function resetPin(sql: postgres.Sql, siteId: string, actor: Actor, id: string): Promise<{ pin: string }> {
  const pin = String(randomInt(1000, 10000));
  const pinHash = await hashSecret(pin);
  await sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update users set pin_hash = ${pinHash}, failed_attempts = 0, locked_until = null, updated_at = now()
      where id = ${id} and site_id = ${siteId} and role <> 'ADMIN' returning id
    `;
    if (!rows[0]) {
      throw new DomainError("NOT_FOUND");
    }
    await track(tx, siteId, actor, "user.pin_reset", "user", id, null, { reset: true });
  });
  return { pin };
}

async function setActive(tx: Tx, siteId: string, actor: Actor, id: string, isActive: boolean) {
  if (actor.id === id && !isActive) {
    throw new DomainError("FORBIDDEN");
  }
  const rows = await tx<{ role: Role; is_active: boolean }[]>`
    select role, is_active from users where id = ${id} and site_id = ${siteId}
  `;
  const user = rows[0];
  if (!user) {
    throw new DomainError("NOT_FOUND");
  }
  if (!isActive && user.role === "ADMIN") {
    await assertNotLastAdmin(tx, siteId, id);
  }
  await tx`update users set is_active = ${isActive}, updated_at = now() where id = ${id}`;
  await track(tx, siteId, actor, isActive ? "user.reactivated" : "user.deactivated", "user", id, user, { isActive });
  return { id, isActive };
}

async function setRole(tx: Tx, siteId: string, actor: Actor, id: string, role: Role) {
  const rows = await tx<{ role: Role }[]>`select role from users where id = ${id} and site_id = ${siteId}`;
  const user = rows[0];
  if (!user) {
    throw new DomainError("NOT_FOUND");
  }
  if (user.role === "ADMIN" && role !== "ADMIN") {
    await assertNotLastAdmin(tx, siteId, id);
  }
  await tx`update users set role = ${role}::user_role, updated_at = now() where id = ${id}`;
  await track(tx, siteId, actor, "user.role", "user", id, user, { role });
  return { id, role };
}

async function assertNotLastAdmin(tx: Tx, siteId: string, id: string): Promise<void> {
  const rows = await tx<{ count: number }[]>`
    select count(*)::int as count from users
    where site_id = ${siteId} and role = 'ADMIN' and is_active and id <> ${id}
  `;
  if ((rows[0]?.count ?? 0) === 0) {
    throw new DomainError("LAST_ADMIN");
  }
}

async function clock(tx: Tx, siteId: string, actor: Actor, now: Date, direction: "in" | "out") {
  const open = await tx<{ id: string }[]>`
    select id from attendance where site_id = ${siteId} and user_id = ${actor.id} and clock_out is null
  `;
  if (direction === "in") {
    if (open[0]) {
      throw new DomainError("OVERLAP");
    }
    const id = newId();
    await tx`
      insert into attendance (id, site_id, user_id, clock_in, source)
      values (${id}, ${siteId}, ${actor.id}, ${now.toISOString()}, 'SELF')
    `;
    await track(tx, siteId, actor, "attendance.clock_in", "attendance", id, null, { clockIn: now.toISOString() });
    return { id };
  }
  const row = open[0];
  if (!row) {
    throw new DomainError("INVALID_TRANSITION");
  }
  await tx`update attendance set clock_out = ${now.toISOString()} where id = ${row.id}`;
  await track(tx, siteId, actor, "attendance.clock_out", "attendance", row.id, null, { clockOut: now.toISOString() });
  return { id: row.id };
}

async function listAttendance(
  sql: postgres.Sql,
  siteId: string,
  actor: Actor,
  filter: { from?: string | undefined; to?: string | undefined; userId?: string | undefined },
) {
  const userId = actor.role === "ADMIN" ? (filter.userId ?? null) : actor.id;
  if (actor.role !== "ADMIN" && filter.userId && filter.userId !== actor.id) {
    throw new DomainError("FORBIDDEN");
  }
  const rows = await sql<
    { user_id: string; day: string; minutes: number }[]
  >`
    select user_id, (clock_in at time zone 'Africa/Tunis')::date::text as day,
           coalesce(sum(extract(epoch from (clock_out - clock_in)) / 60), 0)::int as minutes
    from attendance
    where site_id = ${siteId} and clock_out is not null
      and (${userId}::uuid is null or user_id = ${userId}::uuid)
      and (${filter.from ?? null}::date is null or (clock_in at time zone 'Africa/Tunis')::date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or (clock_in at time zone 'Africa/Tunis')::date <= ${filter.to ?? null}::date)
    group by user_id, day
    order by day
  `;
  return { days: rows.map((row) => ({ userId: row.user_id, day: row.day, minutes: row.minutes })) };
}

async function editAttendance(
  tx: Tx,
  siteId: string,
  actor: Actor,
  id: string,
  patch: { clockIn?: string | undefined; clockOut?: string | undefined | null; reason: string },
) {
  const rows = await tx<{ clock_in: string; clock_out: string | null }[]>`
    select clock_in, clock_out from attendance where id = ${id} and site_id = ${siteId}
  `;
  const before = rows[0];
  if (!before) {
    throw new DomainError("NOT_FOUND");
  }
  await tx`
    update attendance set
      clock_in = coalesce(${patch.clockIn ?? null}, clock_in),
      clock_out = ${patch.clockOut === undefined ? before.clock_out : patch.clockOut},
      edited_by = ${actor.id},
      edit_reason = ${patch.reason},
      source = 'ADMIN'
    where id = ${id}
  `;
  await track(tx, siteId, actor, "attendance.edited", "attendance", id, before, patch);
  return patch;
}

async function getStaffShifts(sql: postgres.Sql, siteId: string, weekStart: string) {
  const end = new Date(`${weekStart}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const weekEnd = end.toISOString().slice(0, 10);
  return sql`
    select * from staff_shifts
    where site_id = ${siteId} and work_date between ${weekStart} and ${weekEnd}
    order by work_date, start_time
  `;
}

async function putStaffShifts(
  tx: Tx,
  siteId: string,
  actor: Actor,
  weekStart: string,
  slots: { userId: string; workDate: string; startTime: string; endTime: string; note?: string | undefined }[],
) {
  const byUser = new Map<string, typeof slots>();
  for (const slot of slots) {
    const list = byUser.get(slot.userId) ?? [];
    list.push(slot);
    byUser.set(slot.userId, list);
  }
  for (const list of byUser.values()) {
    const ordered = [...list].sort((a, b) => `${a.workDate}${a.startTime}`.localeCompare(`${b.workDate}${b.startTime}`));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (previous && current && previous.workDate === current.workDate && previous.endTime > current.startTime) {
        throw new DomainError("OVERLAP");
      }
    }
  }
  const end = new Date(`${weekStart}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const weekEnd = end.toISOString().slice(0, 10);
  await tx`delete from staff_shifts where site_id = ${siteId} and work_date between ${weekStart} and ${weekEnd}`;
  for (const slot of slots) {
    await tx`
      insert into staff_shifts (id, site_id, user_id, work_date, start_time, end_time, note)
      values (${newId()}, ${siteId}, ${slot.userId}, ${slot.workDate}, ${slot.startTime}, ${slot.endTime}, ${slot.note ?? null})
    `;
  }
  await track(tx, siteId, actor, "staff_shifts.replaced", "staff_shift", siteId, null, { weekStart, count: slots.length });
  return { weekStart, count: slots.length };
}

async function insertStockItem(
  tx: Tx,
  siteId: string,
  actor: Actor,
  input: {
    id: string;
    code: string;
    nameFr: string;
    nameAr?: string | undefined;
    baseUnit: "G" | "ML" | "PIECE";
    minThresholdBase: number;
    supplierId?: string | undefined;
  },
) {
  await tx`
    insert into stock_items (id, site_id, code, name_fr, name_ar, base_unit, min_threshold_base, supplier_id)
    values (
      ${input.id}, ${siteId}, ${input.code}, ${input.nameFr}, ${input.nameAr ?? null},
      ${input.baseUnit}::base_unit, ${input.minThresholdBase}, ${input.supplierId ?? null}
    )
  `;
  await track(tx, siteId, actor, "stock_item.created", "stock_item", input.id, null, input);
  return input;
}

async function patchStockItem(
  tx: Tx,
  siteId: string,
  actor: Actor,
  id: string,
  patch: { code?: string | undefined; nameFr?: string | undefined; nameAr?: string | undefined; minThresholdBase?: number | undefined; supplierId?: string | undefined; isActive?: boolean | undefined },
) {
  const rows = await tx<{ id: string }[]>`
    update stock_items set
      code = coalesce(${patch.code ?? null}, code),
      name_fr = coalesce(${patch.nameFr ?? null}, name_fr),
      name_ar = coalesce(${patch.nameAr ?? null}, name_ar),
      min_threshold_base = coalesce(${patch.minThresholdBase ?? null}, min_threshold_base),
      supplier_id = coalesce(${patch.supplierId ?? null}, supplier_id),
      is_active = coalesce(${patch.isActive ?? null}, is_active)
    where id = ${id} and site_id = ${siteId} returning id
  `;
  if (!rows[0]) {
    throw new DomainError("NOT_FOUND");
  }
  await track(tx, siteId, actor, "stock_item.updated", "stock_item", id, null, patch);
  return patch;
}

async function setRecipe(
  tx: Tx,
  siteId: string,
  actor: Actor,
  productId: string,
  ingredients: { stockItemId: string; quantityBase: number }[],
) {
  await assertSameSite(tx, "products", productId, siteId);
  await tx`delete from product_ingredients where product_id = ${productId}`;
  for (const ingredient of ingredients) {
    await assertSameSite(tx, "stock_items", ingredient.stockItemId, siteId);
    await tx`
      insert into product_ingredients (product_id, stock_item_id, quantity_base)
      values (${productId}, ${ingredient.stockItemId}, ${ingredient.quantityBase})
    `;
  }
  await track(tx, siteId, actor, "recipe.replaced", "product", productId, null, { ingredients });
  return { productId, ingredients };
}

async function manualMovement(
  tx: Tx,
  siteId: string,
  actor: Actor,
  input: { stockItemId: string; deltaBase: number; reason: "WASTE" | "CORRECTION"; note: string },
) {
  const rows = await tx<{ quantity_base: number }[]>`
    select quantity_base from stock_items where id = ${input.stockItemId} and site_id = ${siteId} for update
  `;
  const item = rows[0];
  if (!item) {
    throw new DomainError("NOT_FOUND");
  }
  const next = item.quantity_base + input.deltaBase;
  await tx`update stock_items set quantity_base = ${next} where id = ${input.stockItemId}`;
  await tx`
    insert into stock_movements (id, site_id, stock_item_id, delta_base, reason, note, created_by)
    values (
      ${newId()}, ${siteId}, ${input.stockItemId}, ${input.deltaBase}, ${input.reason}::stock_movement_reason,
      ${input.note}, ${actor.id}
    )
  `;
  await track(tx, siteId, actor, "stock.movement", "stock_item", input.stockItemId, item, { next, ...input });
  return { quantityBase: next };
}

async function takeInventory(
  tx: Tx,
  siteId: string,
  actor: Actor,
  input: { note?: string | undefined; lines: { stockItemId: string; countedBase: number }[] },
) {
  const id = newId();
  await tx`
    insert into stock_inventories (id, site_id, taken_by, note) values (${id}, ${siteId}, ${actor.id}, ${input.note ?? null})
  `;
  const lines = [];
  for (const line of input.lines) {
    const rows = await tx<{ quantity_base: number; cost: number }[]>`
      select quantity_base, avg_cost_millimes_per_1000_base as cost
      from stock_items where id = ${line.stockItemId} and site_id = ${siteId} for update
    `;
    const item = rows[0];
    if (!item) {
      throw new DomainError("NOT_FOUND");
    }
    const diff = line.countedBase - item.quantity_base;
    const value = diff === 0 ? 0 : Math.sign(diff) * lineCostMillimes(Math.abs(diff), item.cost);
    await tx`
      insert into stock_inventory_lines (inventory_id, stock_item_id, expected_base, counted_base, diff_base, diff_value_millimes)
      values (${id}, ${line.stockItemId}, ${item.quantity_base}, ${line.countedBase}, ${diff}, ${value})
    `;
    if (diff !== 0) {
      await tx`update stock_items set quantity_base = ${line.countedBase} where id = ${line.stockItemId}`;
      await tx`
        insert into stock_movements (id, site_id, stock_item_id, delta_base, reason, ref_type, ref_id, unit_cost, created_by)
        values (
          ${newId()}, ${siteId}, ${line.stockItemId}, ${diff}, 'INVENTORY', 'inventory', ${id}, ${item.cost}, ${actor.id}
        )
      `;
    }
    lines.push({ stockItemId: line.stockItemId, expectedBase: item.quantity_base, countedBase: line.countedBase, diffBase: diff, diffValueMillimes: value });
  }
  await track(tx, siteId, actor, "inventory.taken", "stock_inventory", id, null, { lines });
  return { id, lines };
}

async function insertSupplier(tx: Tx, siteId: string, actor: Actor, input: { id: string; name: string; phone?: string | undefined; note?: string | undefined }) {
  await tx`
    insert into suppliers (id, site_id, name, phone, note)
    values (${input.id}, ${siteId}, ${input.name}, ${input.phone ?? null}, ${input.note ?? null})
  `;
  await track(tx, siteId, actor, "supplier.created", "supplier", input.id, null, input);
  return input;
}

async function patchSupplier(
  tx: Tx,
  siteId: string,
  actor: Actor,
  id: string,
  patch: { name?: string | undefined; phone?: string | undefined; note?: string | undefined; isActive?: boolean | undefined },
) {
  const rows = await tx<{ id: string }[]>`
    update suppliers set
      name = coalesce(${patch.name ?? null}, name),
      phone = coalesce(${patch.phone ?? null}, phone),
      note = coalesce(${patch.note ?? null}, note),
      is_active = coalesce(${patch.isActive ?? null}, is_active),
      updated_at = now()
    where id = ${id} and site_id = ${siteId} returning id
  `;
  if (!rows[0]) {
    throw new DomainError("NOT_FOUND");
  }
  await track(tx, siteId, actor, "supplier.updated", "supplier", id, null, patch);
  return patch;
}

async function insertPurchase(
  tx: Tx,
  siteId: string,
  actor: Actor,
  input: {
    id: string;
    supplierId: string;
    invoiceRef?: string | undefined;
    purchaseDate: string;
    lines: { stockItemId: string; quantityBase: number; totalCostMillimes: number }[];
  },
) {
  const total = input.lines.reduce((sum, line) => sum + line.totalCostMillimes, 0);
  await tx`
    insert into purchases (id, site_id, supplier_id, invoice_ref, purchase_date, total_millimes, created_by)
    values (${input.id}, ${siteId}, ${input.supplierId}, ${input.invoiceRef ?? null}, ${input.purchaseDate}, ${total}, ${actor.id})
  `;
  for (const line of input.lines) {
    await tx`
      insert into purchase_lines (purchase_id, stock_item_id, quantity_base, total_cost_millimes)
      values (${input.id}, ${line.stockItemId}, ${line.quantityBase}, ${line.totalCostMillimes})
    `;
  }
  await track(tx, siteId, actor, "purchase.created", "purchase", input.id, null, { total });
  return { id: input.id, totalMillimes: total, status: "DRAFT" };
}

async function patchPurchase(
  tx: Tx,
  siteId: string,
  actor: Actor,
  id: string,
  input: {
    supplierId?: string | undefined;
    invoiceRef?: string | undefined;
    purchaseDate?: string | undefined;
    lines?: { stockItemId: string; quantityBase: number; totalCostMillimes: number }[] | undefined;
  },
) {
  await assertDraft(tx, siteId, id);
  if (input.lines) {
    await tx`delete from purchase_lines where purchase_id = ${id}`;
    for (const line of input.lines) {
      await tx`
        insert into purchase_lines (purchase_id, stock_item_id, quantity_base, total_cost_millimes)
        values (${id}, ${line.stockItemId}, ${line.quantityBase}, ${line.totalCostMillimes})
      `;
    }
    const total = input.lines.reduce((sum, line) => sum + line.totalCostMillimes, 0);
    await tx`update purchases set total_millimes = ${total} where id = ${id}`;
  }
  await tx`
    update purchases set
      supplier_id = coalesce(${input.supplierId ?? null}, supplier_id),
      invoice_ref = coalesce(${input.invoiceRef ?? null}, invoice_ref),
      purchase_date = coalesce(${input.purchaseDate ?? null}, purchase_date)
    where id = ${id}
  `;
  await track(tx, siteId, actor, "purchase.updated", "purchase", id, null, input);
  return input;
}

async function receivePurchase(tx: Tx, siteId: string, actor: Actor, id: string, now: Date) {
  await assertDraft(tx, siteId, id);
  const lines = await tx<{ stock_item_id: string; quantity_base: number; total_cost_millimes: number }[]>`
    select stock_item_id, quantity_base, total_cost_millimes from purchase_lines where purchase_id = ${id}
  `;
  let total = 0;
  for (const line of lines) {
    total += line.total_cost_millimes;
    const items = await tx<{ quantity_base: number; cost: number }[]>`
      select quantity_base, avg_cost_millimes_per_1000_base as cost
      from stock_items where id = ${line.stock_item_id} and site_id = ${siteId} for update
    `;
    const item = items[0];
    if (!item) {
      throw new DomainError("NOT_FOUND");
    }
    const cost = weightedAverageCostPer1000({
      currentQuantityBase: item.quantity_base,
      currentCostPer1000: item.cost,
      incomingQuantityBase: line.quantity_base,
      incomingTotalCostMillimes: line.total_cost_millimes,
    });
    await tx`
      update stock_items set quantity_base = ${item.quantity_base + line.quantity_base}, avg_cost_millimes_per_1000_base = ${cost}
      where id = ${line.stock_item_id}
    `;
    await tx`
      insert into stock_movements (id, site_id, stock_item_id, delta_base, reason, ref_type, ref_id, unit_cost, created_by)
      values (
        ${newId()}, ${siteId}, ${line.stock_item_id}, ${line.quantity_base}, 'PURCHASE', 'purchase', ${id}, ${cost}, ${actor.id}
      )
    `;
  }
  await tx`
    update purchases set status = 'RECEIVED', total_millimes = ${total}, received_at = ${now.toISOString()} where id = ${id}
  `;
  await track(tx, siteId, actor, "purchase.received", "purchase", id, null, { total });
  return { id, status: "RECEIVED", totalMillimes: total };
}

async function cancelPurchase(tx: Tx, siteId: string, actor: Actor, id: string) {
  const rows = await tx<{ status: string }[]>`select status from purchases where id = ${id} and site_id = ${siteId} for update`;
  const purchase = rows[0];
  if (!purchase) {
    throw new DomainError("NOT_FOUND");
  }
  if (purchase.status !== "RECEIVED") {
    throw new DomainError("INVALID_TRANSITION");
  }
  const lines = await tx<{ stock_item_id: string; quantity_base: number; total_cost_millimes: number }[]>`
    select stock_item_id, quantity_base, total_cost_millimes from purchase_lines where purchase_id = ${id}
  `;
  for (const line of lines) {
    const items = await tx<{ quantity_base: number; cost: number }[]>`
      select quantity_base, avg_cost_millimes_per_1000_base as cost
      from stock_items where id = ${line.stock_item_id} for update
    `;
    const item = items[0];
    if (!item) {
      throw new DomainError("NOT_FOUND");
    }
    const nextQty = item.quantity_base - line.quantity_base;
    const currentValueTimes1000 = BigInt(item.quantity_base) * BigInt(item.cost);
    const removedTimes1000 = BigInt(line.total_cost_millimes) * 1000n;
    const nextCost =
      nextQty > 0 ? Number((currentValueTimes1000 - removedTimes1000 + BigInt(nextQty) / 2n) / BigInt(nextQty)) : item.cost;
    await tx`
      update stock_items set quantity_base = ${nextQty}, avg_cost_millimes_per_1000_base = ${nextCost}
      where id = ${line.stock_item_id}
    `;
    await tx`
      insert into stock_movements (id, site_id, stock_item_id, delta_base, reason, ref_type, ref_id, created_by)
      values (
        ${newId()}, ${siteId}, ${line.stock_item_id}, ${-line.quantity_base}, 'PURCHASE_CANCEL', 'purchase', ${id}, ${actor.id}
      )
    `;
  }
  await tx`update purchases set status = 'CANCELLED' where id = ${id}`;
  await track(tx, siteId, actor, "purchase.cancelled", "purchase", id, purchase, { status: "CANCELLED" });
  return { id, status: "CANCELLED" };
}

async function markPurchasePaid(tx: Tx, siteId: string, actor: Actor, id: string) {
  const rows = await tx<{ id: string }[]>`
    update purchases set payment_status = 'PAID' where id = ${id} and site_id = ${siteId} and status = 'RECEIVED' returning id
  `;
  if (!rows[0]) {
    throw new DomainError("INVALID_TRANSITION");
  }
  await track(tx, siteId, actor, "purchase.paid", "purchase", id, null, { paymentStatus: "PAID" });
  return { id, paymentStatus: "PAID" };
}

async function assertDraft(tx: Tx, siteId: string, id: string): Promise<void> {
  const rows = await tx<{ status: string }[]>`select status from purchases where id = ${id} and site_id = ${siteId}`;
  const purchase = rows[0];
  if (!purchase) {
    throw new DomainError("NOT_FOUND");
  }
  if (purchase.status !== "DRAFT") {
    throw new DomainError("INVALID_TRANSITION");
  }
}

async function insertExpense(
  tx: Tx,
  siteId: string,
  actor: Actor,
  input: {
    id: string;
    category: string;
    amountMillimes: number;
    expenseDate: string;
    note?: string | undefined;
    supplierId?: string | undefined;
    payFromShiftId?: string | undefined;
  },
) {
  await tx`
    insert into expenses (id, site_id, category, amount_millimes, expense_date, note, supplier_id, created_by)
    values (
      ${input.id}, ${siteId}, ${input.category}::expense_category, ${input.amountMillimes}, ${input.expenseDate},
      ${input.note ?? null}, ${input.supplierId ?? null}, ${actor.id}
    )
  `;
  if (input.payFromShiftId) {
    await addCashMovement(tx, siteId, actor, input.payFromShiftId, {
      type: "PAY_OUT",
      amountMillimes: input.amountMillimes,
      reason: input.note ?? input.category,
      expenseId: input.id,
    });
  }
  await track(tx, siteId, actor, "expense.created", "expense", input.id, null, input);
  return input;
}

async function patchExpense(tx: Tx, siteId: string, actor: Actor, id: string, patch: { note?: string | undefined; isVoid?: boolean | undefined }) {
  const rows = await tx<{ id: string }[]>`
    update expenses set note = coalesce(${patch.note ?? null}, note), is_void = coalesce(${patch.isVoid ?? null}, is_void)
    where id = ${id} and site_id = ${siteId} returning id
  `;
  if (!rows[0]) {
    throw new DomainError("NOT_FOUND");
  }
  await track(tx, siteId, actor, "expense.updated", "expense", id, null, patch);
  return patch;
}

async function openShift(
  tx: Tx,
  siteId: string,
  actor: Actor,
  input: { id: string; openingFloatMillimes: number },
  now: Date,
) {
  if (!actor.deviceId) {
    throw new DomainError("SHIFT_REQUIRED");
  }
  const existing = await tx<{ id: string }[]>`
    select id from cash_shifts where device_id = ${actor.deviceId} and status = 'OPEN'
  `;
  if (existing[0]) {
    throw new DomainError("INVALID_TRANSITION");
  }
  await tx`
    insert into cash_shifts (id, site_id, device_id, cashier_id, opening_float_millimes, opened_at)
    values (${input.id}, ${siteId}, ${actor.deviceId}, ${actor.id}, ${input.openingFloatMillimes}, ${now.toISOString()})
  `;
  await track(tx, siteId, actor, "shift.opened", "cash_shift", input.id, null, input);
  return {
    shift: input,
    events: [{ name: "shift.opened", serverId: actor.id, payload: { id: input.id, deviceId: actor.deviceId, status: "OPEN", varianceMillimes: null } }],
  };
}

async function addCashMovement(
  tx: Tx,
  siteId: string,
  actor: Actor,
  shiftId: string,
  input: { type: "PAY_IN" | "PAY_OUT"; amountMillimes: number; reason: string; expenseId?: string | undefined },
) {
  const rows = await tx<{ status: string; site_id: string }[]>`
    select status, site_id from cash_shifts where id = ${shiftId} for update
  `;
  const shift = rows[0];
  if (!shift || shift.site_id !== siteId) {
    throw new DomainError("NOT_FOUND");
  }
  if (shift.status !== "OPEN") {
    throw new DomainError("SHIFT_CLOSED");
  }
  const id = newId();
  await tx`
    insert into cash_movements (id, shift_id, type, amount_millimes, reason, expense_id, created_by)
    values (
      ${id}, ${shiftId}, ${input.type}::cash_movement_type, ${input.amountMillimes}, ${input.reason},
      ${input.expenseId ?? null}, ${actor.id}
    )
  `;
  await track(tx, siteId, actor, "cash.movement", "cash_movement", id, null, input);
  return { id };
}

async function closeShift(
  tx: Tx,
  siteId: string,
  actor: Actor,
  fallback: SiteSettings,
  id: string,
  input: { countedMillimes: number; note?: string | undefined },
  now: Date,
) {
  const rows = await tx<{ status: string; opening_float_millimes: number; device_id: string }[]>`
    select status, opening_float_millimes, device_id from cash_shifts where id = ${id} and site_id = ${siteId} for update
  `;
  const shift = rows[0];
  if (!shift) {
    throw new DomainError("NOT_FOUND");
  }
  if (shift.status !== "OPEN") {
    throw new DomainError("SHIFT_CLOSED");
  }
  const cash = await tx<{ total: number }[]>`
    select coalesce(sum(amount_millimes), 0)::int as total from payments where shift_id = ${id} and method = 'CASH'
  `;
  const movements = await tx<{ type: string; total: number }[]>`
    select type, coalesce(sum(amount_millimes), 0)::int as total from cash_movements where shift_id = ${id} group by type
  `;
  const payIn = movements.find((row) => row.type === "PAY_IN")?.total ?? 0;
  const payOut = movements.find((row) => row.type === "PAY_OUT")?.total ?? 0;
  const expected = shift.opening_float_millimes + (cash[0]?.total ?? 0) + payIn - payOut;
  const variance = input.countedMillimes - expected;
  await tx`
    update cash_shifts set
      status = 'CLOSED', closed_at = ${now.toISOString()}, counted_millimes = ${input.countedMillimes},
      expected_millimes = ${expected}, variance_millimes = ${variance}, note = ${input.note ?? null}
    where id = ${id}
  `;
  const thresholdRows = await tx<{ value: number }[]>`
    select value from settings where site_id = ${siteId} and key = 'cashVarianceAlertMillimes'
  `;
  const threshold = typeof thresholdRows[0]?.value === "number" ? thresholdRows[0].value : fallback.cashVarianceAlertMillimes;
  if (Math.abs(variance) > threshold) {
    await track(tx, siteId, actor, "cash.variance", "cash_shift", id, null, { variance, threshold });
  }
  await track(tx, siteId, actor, "shift.closed", "cash_shift", id, null, { expected, variance });
  return {
    expectedMillimes: expected,
    varianceMillimes: variance,
    events: [
      {
        name: "shift.closed",
        serverId: actor.id,
        payload: { id, deviceId: shift.device_id, status: "CLOSED", varianceMillimes: variance },
      },
    ],
  };
}

async function noteShift(tx: Tx, siteId: string, actor: Actor, id: string, note: string) {
  if (actor.role !== "ADMIN") {
    throw new DomainError("FORBIDDEN");
  }
  const rows = await tx<{ status: string }[]>`select status from cash_shifts where id = ${id} and site_id = ${siteId}`;
  if (!rows[0]) {
    throw new DomainError("NOT_FOUND");
  }
  if (rows[0].status !== "CLOSED") {
    throw new DomainError("INVALID_TRANSITION");
  }
  await tx`update cash_shifts set note = ${note} where id = ${id}`;
  await track(tx, siteId, actor, "shift.noted", "cash_shift", id, null, { note });
  return { id, note };
}

async function pay(
  tx: Tx,
  siteId: string,
  actor: Actor,
  fallback: SiteSettings,
  orderId: string,
  input: { method: PaymentMethod; tenderedMillimes?: number | undefined },
  now: Date,
) {
  const orders = await tx<
    { status: string; total_millimes: number; table_id: string | null; server_id: string; version: number }[]
  >`select status, total_millimes, table_id, server_id, version from orders where id = ${orderId} and site_id = ${siteId} for update`;
  const order = orders[0];
  if (!order) {
    throw new DomainError("NOT_FOUND");
  }
  if (order.status === "PAID") {
    throw new DomainError("ALREADY_PAID");
  }
  if (order.status !== "SENT" && order.status !== "SERVED") {
    throw new DomainError("INVALID_TRANSITION");
  }
  if (order.total_millimes <= 0) {
    throw new DomainError("INVALID_TRANSITION");
  }
  const unsent = await tx<{ id: string }[]>`
    select id from order_items where order_id = ${orderId} and status = 'ACTIVE' and sent_at is null
  `;
  if (unsent[0]) {
    throw new DomainError("INVALID_TRANSITION");
  }
  if (input.method === "CASH") {
    if (input.tenderedMillimes === undefined || input.tenderedMillimes < order.total_millimes) {
      throw new DomainError("INVALID_TRANSITION");
    }
  }
  const settingsRows = await tx<{ value: boolean }[]>`
    select value from settings where site_id = ${siteId} and key = 'requireOpenShift'
  `;
  const required = settingsRows[0]?.value === true || (settingsRows[0] === undefined && fallback.requireOpenShift);
  let shiftId: string | null = null;
  if (actor.deviceId) {
    const shifts = await tx<{ id: string }[]>`
      select id from cash_shifts where site_id = ${siteId} and device_id = ${actor.deviceId} and status = 'OPEN'
    `;
    shiftId = shifts[0]?.id ?? null;
  }
  if (required && !shiftId) {
    throw new DomainError("SHIFT_REQUIRED");
  }
  const change = input.method === "CASH" ? (input.tenderedMillimes ?? 0) - order.total_millimes : null;
  const paymentId = newId();
  await tx`
    insert into payments (
      id, site_id, order_id, method, amount_millimes, tendered_millimes, change_millimes, cashier_id, shift_id, created_at
    ) values (
      ${paymentId}, ${siteId}, ${orderId}, ${input.method}::payment_method, ${order.total_millimes},
      ${input.method === "CASH" ? (input.tenderedMillimes ?? null) : null}, ${change}, ${actor.id}, ${shiftId},
      ${now.toISOString()}
    )
  `;
  await tx`
    update orders set status = 'PAID', closed_at = ${now.toISOString()}, version = version + 1, updated_at = now()
    where id = ${orderId}
  `;
  let tableEvent: LiveEvent | null = null;
  if (order.table_id) {
    await tx`update floor_tables set status = 'FREE', updated_at = now() where id = ${order.table_id}`;
    const tables = await tx<{ label: string; zone: string; seats: number }[]>`
      select label, zone, seats from floor_tables where id = ${order.table_id}
    `;
    const table = tables[0];
    if (table) {
      tableEvent = {
        name: "table.updated",
        serverId: order.server_id,
        payload: {
          version: order.version + 1,
          table: {
            id: order.table_id,
            label: table.label,
            zone: table.zone,
            seats: table.seats,
            status: "FREE",
            openOrderId: null,
          },
        },
      };
    }
  }
  await track(tx, siteId, actor, "order.paid", "payment", paymentId, { status: order.status }, {
    amountMillimes: order.total_millimes,
    method: input.method,
    changeMillimes: change,
    notice: NOTICE,
  });
  return {
    notice: NOTICE,
    payment: {
      id: paymentId,
      amountMillimes: order.total_millimes,
      method: input.method,
      tenderedMillimes: input.method === "CASH" ? input.tenderedMillimes : null,
      changeMillimes: change,
    },
    events: [
      { name: "order.paid", serverId: order.server_id, payload: { version: order.version + 1, orderId } },
      { name: "order.updated", serverId: order.server_id, payload: { version: order.version + 1, orderId } },
      ...(tableEvent ? [tableEvent] : []),
    ],
  };
}

async function assertSameSite(tx: Tx, table: "stations" | "categories" | "products" | "printers" | "stock_items", id: string, siteId: string) {
  const rows =
    table === "stations"
      ? await tx<{ site_id: string }[]>`select site_id from stations where id = ${id}`
      : table === "categories"
        ? await tx<{ site_id: string }[]>`select site_id from categories where id = ${id}`
        : table === "products"
          ? await tx<{ site_id: string }[]>`select site_id from products where id = ${id}`
          : table === "printers"
            ? await tx<{ site_id: string }[]>`select site_id from printers where id = ${id}`
            : await tx<{ site_id: string }[]>`select site_id from stock_items where id = ${id}`;
  if (rows[0]?.site_id !== siteId) {
    throw new DomainError("NOT_FOUND");
  }
}

export { NOTICE, vatPortionFromGross };
