import type postgres from "postgres";

/** Atomically allocates the next daily order number for a site and business date. */
export async function allocateDailyNumber(
  sql: postgres.Sql,
  siteId: string,
  businessDate: string,
): Promise<number> {
  const rows = await sql<{ last_number: number }[]>`
    insert into order_counters (site_id, business_date, last_number)
    values (${siteId}, ${businessDate}, 1)
    on conflict (site_id, business_date)
    do update set last_number = order_counters.last_number + 1
    returning last_number
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("order counter did not return a number");
  }
  return row.last_number;
}
