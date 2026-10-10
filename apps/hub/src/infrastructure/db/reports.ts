import { lineCostMillimes, vatPortionFromGross, millimes } from "@resto/shared";
import type postgres from "postgres";

const NOTICE = "Rapport de gestion, pas un document fiscal";

export async function buildReport(
  sql: postgres.Sql,
  siteId: string,
  kind: string,
  from: string,
  to: string,
  stationKind?: string,
): Promise<Record<string, unknown>> {
  if (kind === "dashboard") {
    return { notice: NOTICE, ...(await dashboard(sql, siteId, from, to)) };
  }
  if (kind === "by-hour") {
    return { notice: NOTICE, points: await byHour(sql, siteId, from, to) };
  }
  if (kind === "by-day") {
    return { notice: NOTICE, points: await byDay(sql, siteId, from, to) };
  }
  if (kind === "products") {
    return { notice: NOTICE, products: await topProducts(sql, siteId, from, to, stationKind) };
  }
  if (kind === "payments") {
    return { notice: NOTICE, methods: await payments(sql, siteId, from, to) };
  }
  if (kind === "stations") {
    return { notice: NOTICE, stations: await stations(sql, siteId, from, to) };
  }
  if (kind === "servers") {
    return { notice: NOTICE, servers: await servers(sql, siteId, from, to) };
  }
  if (kind === "voids") {
    return { notice: NOTICE, voids: await voids(sql, siteId, from, to) };
  }
  if (kind === "daily-close") {
    return { notice: NOTICE, ...(await dailyClose(sql, siteId, from, to)) };
  }
  if (kind === "stock-valuation") {
    return { notice: NOTICE, ...(await stockValuation(sql, siteId)) };
  }
  if (kind === "food-cost") {
    return { notice: NOTICE, products: await foodCost(sql, siteId) };
  }
  return { notice: NOTICE, staff: await staffHours(sql, siteId, from, to) };
}

async function dashboard(sql: postgres.Sql, siteId: string, from: string, to: string) {
  const current = await period(sql, siteId, from, to);
  const previousRange = shiftRange(from, to);
  const previous = await period(sql, siteId, previousRange.from, previousRange.to);
  const alerts = await sql<{ count: number }[]>`
    select count(*)::int as count from stock_items
    where site_id = ${siteId} and is_active and quantity_base <= min_threshold_base
  `;
  const variances = await sql<{ count: number }[]>`
    select count(*)::int as count from cash_shifts
    where site_id = ${siteId} and status = 'CLOSED'
      and (closed_at at time zone 'Africa/Tunis')::date between ${from}::date and ${to}::date
      and abs(variance_millimes) > 0
  `;
  return {
    ...current,
    stockAlerts: alerts[0]?.count ?? 0,
    cashVariances: variances[0]?.count ?? 0,
    previous,
  };
}

async function period(sql: postgres.Sql, siteId: string, from: string, to: string) {
  const sales = await sql<{ revenue: number; orders: number }[]>`
    select coalesce(sum(p.amount_millimes), 0)::int as revenue, count(*)::int as orders
    from payments p
    join orders o on o.id = p.order_id
    where p.site_id = ${siteId} and o.business_date between ${from}::date and ${to}::date
  `;
  const voids = await sql<{ count: number; value: number }[]>`
    select count(*)::int as count, coalesce(sum(i.quantity * i.unit_price_millimes), 0)::int as value
    from order_items i
    join orders o on o.id = i.order_id
    where o.site_id = ${siteId} and o.business_date between ${from}::date and ${to}::date and i.status = 'VOIDED'
  `;
  const revenue = sales[0]?.revenue ?? 0;
  const orders = sales[0]?.orders ?? 0;
  return {
    revenueMillimes: revenue,
    orderCount: orders,
    averageBasketMillimes: orders === 0 ? 0 : Math.round(revenue / orders),
    covers: null,
    voidCount: voids[0]?.count ?? 0,
    voidValueMillimes: voids[0]?.value ?? 0,
  };
}

async function byHour(sql: postgres.Sql, siteId: string, from: string, to: string) {
  return sql<{ hour: number; revenue_millimes: number }[]>`
    select extract(hour from p.created_at at time zone 'Africa/Tunis')::int as hour,
           coalesce(sum(p.amount_millimes), 0)::int as revenue_millimes
    from payments p
    join orders o on o.id = p.order_id
    where p.site_id = ${siteId} and o.business_date between ${from}::date and ${to}::date
    group by hour order by hour
  `;
}

async function byDay(sql: postgres.Sql, siteId: string, from: string, to: string) {
  return sql`
    select o.business_date::text as day, coalesce(sum(p.amount_millimes), 0)::int as revenue_millimes
    from payments p join orders o on o.id = p.order_id
    where p.site_id = ${siteId} and o.business_date between ${from}::date and ${to}::date
    group by o.business_date order by o.business_date
  `;
}

async function topProducts(sql: postgres.Sql, siteId: string, from: string, to: string, stationKind?: string) {
  return sql`
    select i.product_name_snapshot as name, sum(i.quantity)::int as quantity,
           sum(i.quantity * i.unit_price_millimes)::int as revenue_millimes
    from order_items i
    join orders o on o.id = i.order_id
    join stations s on s.id = i.station_id
    where o.site_id = ${siteId} and o.status = 'PAID' and i.status = 'ACTIVE'
      and o.business_date between ${from}::date and ${to}::date
      and (${stationKind ?? null}::text is null or s.kind = ${stationKind ?? null}::station_kind)
    group by i.product_name_snapshot
    order by revenue_millimes desc
  `;
}

async function payments(sql: postgres.Sql, siteId: string, from: string, to: string) {
  return sql`
    select p.method, coalesce(sum(p.amount_millimes), 0)::int as amount_millimes, count(*)::int as count
    from payments p join orders o on o.id = p.order_id
    where p.site_id = ${siteId} and o.business_date between ${from}::date and ${to}::date
    group by p.method
  `;
}

async function stations(sql: postgres.Sql, siteId: string, from: string, to: string) {
  return sql`
    select s.kind, sum(i.quantity)::int as quantity, sum(i.quantity * i.unit_price_millimes)::int as revenue_millimes
    from order_items i
    join orders o on o.id = i.order_id
    join stations s on s.id = i.station_id
    where o.site_id = ${siteId} and o.status = 'PAID' and i.status = 'ACTIVE'
      and o.business_date between ${from}::date and ${to}::date
    group by s.kind
  `;
}

async function servers(sql: postgres.Sql, siteId: string, from: string, to: string) {
  return sql`
    select o.server_id, count(distinct o.id)::int as orders,
           coalesce(sum(p.amount_millimes), 0)::int as revenue_millimes,
           count(i.id) filter (where i.status = 'VOIDED')::int as voids
    from orders o
    left join payments p on p.order_id = o.id
    left join order_items i on i.order_id = o.id
    where o.site_id = ${siteId} and o.business_date between ${from}::date and ${to}::date
    group by o.server_id
  `;
}

async function voids(sql: postgres.Sql, siteId: string, from: string, to: string) {
  return sql`
    select c.id, c.reason, c.requested_by, c.decided_by, c.override_by, o.business_date::text as business_date
    from cancellation_requests c
    join orders o on o.id = c.order_id
    where o.site_id = ${siteId} and c.status = 'APPROVED'
      and o.business_date between ${from}::date and ${to}::date
    order by c.decided_at
  `;
}

async function dailyClose(sql: postgres.Sql, siteId: string, from: string, to: string) {
  const methods = await payments(sql, siteId, from, to);
  const lines = await sql<{ gross: number; vat_rate_bp: number }[]>`
    select (i.quantity * i.unit_price_millimes)::int as gross, pr.vat_rate_bp
    from order_items i
    join orders o on o.id = i.order_id
    join products pr on pr.id = i.product_id
    where o.site_id = ${siteId} and o.status = 'PAID' and i.status = 'ACTIVE'
      and o.business_date between ${from}::date and ${to}::date
  `;
  const vatMillimes = lines.reduce((sum, line) => sum + vatPortionFromGross(millimes(line.gross), line.vat_rate_bp), 0);
  const voided = await period(sql, siteId, from, to);
  return { methods, vatMillimes, voidCount: voided.voidCount, voidValueMillimes: voided.voidValueMillimes };
}

async function stockValuation(sql: postgres.Sql, siteId: string) {
  const rows = await sql<{ quantity_base: number; cost: number }[]>`
    select quantity_base, avg_cost_millimes_per_1000_base as cost from stock_items where site_id = ${siteId} and is_active
  `;
  const valueMillimes = rows.reduce((sum, row) => {
    const signed = Math.sign(row.quantity_base) * lineCostMillimes(Math.abs(row.quantity_base), row.cost);
    return sum + signed;
  }, 0);
  return { valueMillimes };
}

async function foodCost(sql: postgres.Sql, siteId: string) {
  const products = await sql<{ id: string; name_fr: string; price_millimes: number }[]>`
    select id, name_fr, price_millimes from products where site_id = ${siteId} and is_active
  `;
  const result = [];
  for (const product of products) {
    const lines = await sql<{ quantity_base: number; cost: number }[]>`
      select i.quantity_base, s.avg_cost_millimes_per_1000_base as cost
      from product_ingredients i join stock_items s on s.id = i.stock_item_id
      where i.product_id = ${product.id}
    `;
    const cost = lines.reduce((sum, line) => sum + lineCostMillimes(line.quantity_base, line.cost), 0);
    result.push({
      name: product.name_fr,
      priceMillimes: product.price_millimes,
      costMillimes: cost,
      marginMillimes: product.price_millimes - cost,
    });
  }
  return result;
}

async function staffHours(sql: postgres.Sql, siteId: string, from: string, to: string) {
  return sql`
    select user_id, coalesce(sum(extract(epoch from (clock_out - clock_in)) / 60), 0)::int as minutes
    from attendance
    where site_id = ${siteId} and clock_out is not null
      and (clock_in at time zone 'Africa/Tunis')::date between ${from}::date and ${to}::date
    group by user_id
  `;
}

function shiftRange(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86_400_000);
  return { from: previousStart.toISOString().slice(0, 10), to: previousEnd.toISOString().slice(0, 10) };
}

export function toCsv(rows: readonly Record<string, unknown>[]): string {
  const first = rows[0];
  const headers = first ? Object.keys(first) : ["empty"];
  const body = rows.length === 0 ? [] : rows.map((row) => headers.map((key) => cell(key, row[key])));
  const lines = [headers.join(";"), ...body.map((row) => row.join(";"))];
  return `\uFEFF${lines.join("\r\n")}`;
}

function cell(key: string, value: unknown): string {
  if (typeof value === "number" && /millime|revenue|amount|margin|cost|price/i.test(key)) {
    return tnd(value);
  }
  const text = value == null ? "" : String(value);
  return text.includes(";") || text.includes('"') ? `"${text.replaceAll('"', '""')}"` : text;
}

function tnd(millimesValue: number): string {
  const sign = millimesValue < 0 ? "-" : "";
  const absolute = Math.abs(millimesValue);
  return `${sign}${Math.trunc(absolute / 1000)},${String(absolute % 1000).padStart(3, "0")}`;
}
