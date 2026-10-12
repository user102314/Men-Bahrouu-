import type postgres from "postgres";

import { menuProduct } from "./menu-catalog.js";
import { SEED_IDS } from "./seed-ids.js";

const supplierMarket = "0199c0a0-0000-7000-8000-000000000801";
const supplierOil = "0199c0a0-0000-7000-8000-000000000802";
const supplierCoffee = "0199c0a0-0000-7000-8000-000000000803";
const purchaseId = "0199c0a0-0000-7000-8000-000000000901";

/** Tunisian pantry, recipes for the service menu, one received purchase, expenses, and this week's plan. */
export async function seedAdminDemo(sql: postgres.Sql, siteId: string): Promise<void> {
  const items = pantry();
  await sql`
    insert into suppliers (id, site_id, name, phone, note) values
      (${supplierMarket}, ${siteId}, 'Marché central', '71234567', 'Fruits, légumes, poisson'),
      (${supplierOil}, ${siteId}, 'Huilerie de Sfax', '74222000', 'Huile d''olive'),
      (${supplierCoffee}, ${siteId}, 'Café Ben Yedder', '71333000', 'Café et thé')
  `;
  for (const item of items) {
    const cost = Math.round((item.costMillimes * 1000) / item.quantity);
    await sql`
      insert into stock_items (
        id, site_id, code, name_fr, name_ar, base_unit, quantity_base, min_threshold_base,
        avg_cost_millimes_per_1000_base, supplier_id
      ) values (
        ${item.id}, ${siteId}, ${item.code}, ${item.nameFr}, ${item.nameAr}, ${item.unit}::base_unit,
        ${item.quantity}, ${item.threshold}, ${cost}, ${item.supplier}
      )
    `;
  }
  const total = items.reduce((sum, item) => sum + item.costMillimes, 0);
  await sql`
    insert into purchases (id, site_id, supplier_id, invoice_ref, purchase_date, status, total_millimes, payment_status, received_at, created_by)
    values (
      ${purchaseId}, ${siteId}, ${supplierMarket}, 'FAC-2026-014', '2026-10-01', 'RECEIVED', ${total}, 'PAID',
      '2026-10-01T09:00:00.000Z', ${SEED_IDS.karim}
    )
  `;
  for (const [index, item] of items.entries()) {
    const cost = Math.round((item.costMillimes * 1000) / item.quantity);
    await sql`
      insert into purchase_lines (purchase_id, stock_item_id, quantity_base, total_cost_millimes)
      values (${purchaseId}, ${item.id}, ${item.quantity}, ${item.costMillimes})
    `;
    await sql`
      insert into stock_movements (id, site_id, stock_item_id, delta_base, reason, ref_type, ref_id, unit_cost, created_by, created_at)
      values (
        ${`0199c0a0-0000-7000-8000-${(0xd01 + index).toString(16).padStart(12, "0")}`}, ${siteId}, ${item.id}, ${item.quantity},
        'PURCHASE', 'purchase', ${purchaseId}, ${cost}, ${SEED_IDS.karim}, '2026-10-01T09:00:00.000Z'
      )
    `;
  }
  for (const recipe of recipes(items)) {
    await sql`
      insert into product_ingredients (product_id, stock_item_id, quantity_base)
      values (${recipe.productId}, ${recipe.stockId}, ${recipe.quantity})
    `;
  }
  await sql`
    insert into expenses (id, site_id, category, amount_millimes, expense_date, note, created_by) values
      ('0199c0a0-0000-7000-8000-000000000911', ${siteId}, 'RENT', 1200000, '2026-10-01', 'Loyer octobre', ${SEED_IDS.karim}),
      ('0199c0a0-0000-7000-8000-000000000912', ${siteId}, 'SUPPLIES', 45000, '2026-10-03', 'Glace et gaz', ${SEED_IDS.karim}),
      ('0199c0a0-0000-7000-8000-000000000913', ${siteId}, 'UTILITIES', 180000, '2026-10-05', 'Électricité', ${SEED_IDS.karim})
  `;
  await sql`
    insert into settings (site_id, key, value, updated_by) values
      (${siteId}, 'restaurant', ${sql.json({ name: "Men Bahrouu", address: "Tunis", phone: "71000000" })}, ${SEED_IDS.karim}),
      (${siteId}, 'requireOpenShift', ${sql.json(false)}, ${SEED_IDS.karim}),
      (${siteId}, 'restockOnVoid', ${sql.json(false)}, ${SEED_IDS.karim})
  `;
  const week = currentMonday();
  const staff = [SEED_IDS.mohamed, SEED_IDS.amira, SEED_IDS.youssef, SEED_IDS.sonia];
  for (let day = 0; day < 7; day += 1) {
    const date = addDays(week, day);
    const userId = staff[day % staff.length] ?? SEED_IDS.mohamed;
    await sql`
      insert into staff_shifts (id, site_id, user_id, work_date, start_time, end_time, note)
      values (${shiftId(day)}, ${siteId}, ${userId}, ${date}, '11:00', '15:00', 'Service midi')
    `;
    await sql`
      insert into staff_shifts (id, site_id, user_id, work_date, start_time, end_time)
      values (${shiftId(day + 7)}, ${siteId}, ${staff[(day + 1) % staff.length] ?? SEED_IDS.sonia}, ${date}, '18:00', '23:00')
    `;
  }
  await sql`
    insert into attendance (id, site_id, user_id, clock_in, clock_out, source) values
      ('0199c0a0-0000-7000-8000-000000000a01', ${siteId}, ${SEED_IDS.mohamed}, ${`${addDays(week, 0)}T10:00:00+01:00`}, ${`${addDays(week, 0)}T15:05:00+01:00`}, 'SELF'),
      ('0199c0a0-0000-7000-8000-000000000a02', ${siteId}, ${SEED_IDS.amira}, ${`${addDays(week, 1)}T17:50:00+01:00`}, ${`${addDays(week, 1)}T23:10:00+01:00`}, 'SELF'),
      ('0199c0a0-0000-7000-8000-000000000a03', ${siteId}, ${SEED_IDS.sonia}, ${`${addDays(week, 2)}T10:55:00+01:00`}, ${`${addDays(week, 2)}T16:00:00+01:00`}, 'SELF')
  `;
}

function pantry() {
  const row = (
    n: number,
    code: string,
    nameFr: string,
    nameAr: string,
    unit: "G" | "ML" | "PIECE",
    quantity: number,
    threshold: number,
    costMillimes: number,
    supplier: string,
  ) => ({
    id: `0199c0a0-0000-7000-8000-${(0x700 + n).toString(16).padStart(12, "0")}`,
    code,
    nameFr,
    nameAr,
    unit,
    quantity,
    threshold,
    costMillimes,
    supplier,
  });
  return [
    row(1, "SEM", "Semoule fine", "سميد رقيق", "G", 20000, 2000, 24000, supplierMarket),
    row(2, "POI", "Poisson frais", "سمك طازج", "G", 8000, 1500, 96000, supplierMarket),
    row(3, "HUI", "Huile d'olive", "زيت زيتون", "ML", 5000, 500, 40000, supplierOil),
    row(4, "HAR", "Harissa", "هريسة", "G", 2000, 200, 12000, supplierMarket),
    row(5, "CIT", "Citrons", "ليمون", "G", 3000, 400, 6000, supplierMarket),
    row(6, "MEN", "Menthe", "نعناع", "G", 500, 80, 2000, supplierMarket),
    row(7, "CAF", "Café moulu", "قهوة مطحونة", "G", 2000, 200, 30000, supplierCoffee),
    row(8, "SUC", "Sucre semoule", "سكر", "G", 5000, 500, 5000, supplierMarket),
    row(9, "THE", "Thé vert", "شاي أخضر", "G", 800, 100, 14400, supplierCoffee),
    row(10, "OEU", "Œufs", "بيض", "PIECE", 60, 12, 24000, supplierMarket),
    row(11, "THO", "Thon", "تن", "G", 2000, 300, 16000, supplierMarket),
    row(12, "TOM", "Tomates", "طماطم", "G", 4000, 500, 6000, supplierMarket),
    row(13, "OIG", "Oignons", "بصل", "G", 3000, 400, 2400, supplierMarket),
    row(14, "AIL", "Ail", "ثوم", "G", 500, 50, 1500, supplierMarket),
    row(15, "PIM", "Piment", "فلفل حار", "G", 400, 50, 1000, supplierMarket),
    row(16, "SEL", "Sel", "ملح", "G", 2000, 200, 400, supplierMarket),
    row(17, "FAR", "Farine", "فرينة", "G", 10000, 1000, 8000, supplierMarket),
    row(18, "POU", "Escalope de poulet", "إسكالوب دجاج", "G", 6000, 800, 36000, supplierMarket),
    row(19, "FRO", "Fromage râpé", "جبن مبشور", "G", 1500, 200, 18000, supplierMarket),
    row(20, "JAM", "Jambon", "جامبون", "G", 1500, 200, 21000, supplierMarket),
    row(21, "CRE", "Crème liquide", "قشدة سائلة", "ML", 2000, 300, 10000, supplierMarket),
    row(22, "MAS", "Mascarpone", "ماسكاربوني", "G", 1000, 200, 16000, supplierMarket),
    row(23, "EAU", "Eau minérale", "ماء معدني", "ML", 24000, 3000, 4800, supplierMarket),
    row(24, "ORG", "Oranges", "برتقال", "G", 5000, 600, 9000, supplierMarket),
    row(25, "PIV", "Poivre", "فلفل أكحل", "G", 200, 30, 2000, supplierMarket),
    row(26, "CUM", "Cumin", "كمون", "G", 300, 40, 2400, supplierMarket),
    row(27, "PGN", "Pignons de pin", "زقوقو صنوبر", "G", 500, 80, 20000, supplierMarket),
    row(28, "ZGO", "Graines de zgougou", "حبوب الزقوقو", "G", 800, 100, 16000, supplierMarket),
    row(29, "POIS", "Pois chiches", "حمص", "G", 3000, 400, 7500, supplierMarket),
    row(30, "BIS", "Biscuits à la cuillère", "بسكويت", "G", 1000, 150, 5000, supplierMarket),
  ];
}

function recipes(items: { id: string; code: string }[]) {
  const id = (code: string) => {
    const found = items.find((item) => item.code === code);
    if (!found) {
      throw new Error(`Missing stock item ${code}`);
    }
    return found.id;
  };
  const line = (productId: string, code: string, quantity: number) => ({
    productId,
    stockId: id(code),
    quantity,
  });
  const dish = (code: string) => menuProduct(code).id;
  return [
    line(dish("the-amandes"), "THE", 3),
    line(dish("the-amandes"), "SUC", 15),
    line(dish("citronnade"), "CIT", 80),
    line(dish("citronnade"), "SUC", 20),
    line(dish("citronnade"), "EAU", 200),
    line(dish("eau-minerale-1l"), "EAU", 1000),
    line(dish("brik-thon"), "THO", 40),
    line(dish("brik-thon"), "OEU", 1),
    line(dish("brik-thon"), "HUI", 10),
    line(dish("salade-mechouia"), "TOM", 150),
    line(dish("salade-mechouia"), "PIM", 20),
    line(dish("salade-mechouia"), "AIL", 5),
    line(dish("salade-mechouia"), "HUI", 15),
    line(dish("salade-tunisienne"), "TOM", 120),
    line(dish("salade-tunisienne"), "OIG", 40),
    line(dish("salade-tunisienne"), "CIT", 20),
    line(dish("salade-tunisienne"), "HUI", 10),
    line(dish("daurade-grillee"), "POI", 250),
    line(dish("daurade-grillee"), "CIT", 20),
    line(dish("daurade-grillee"), "HUI", 15),
    line(dish("daurade-grillee"), "CUM", 2),
    line(dish("escalope-panee"), "POU", 180),
    line(dish("escalope-panee"), "FAR", 30),
    line(dish("escalope-panee"), "HUI", 10),
    line(dish("spaghetti-fruits-de-mer"), "POI", 80),
    line(dish("spaghetti-fruits-de-mer"), "CRE", 80),
    line(dish("spaghetti-fruits-de-mer"), "AIL", 5),
    line(dish("spaghetti-fruits-de-mer"), "TOM", 60),
  ];
}

function shiftId(index: number): string {
  return `0199c0a0-0000-7000-8000-${(0xc01 + index).toString(16).padStart(12, "0")}`;
}

function currentMonday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${parts}T00:00:00Z`);
  const weekDay = date.getUTCDay();
  const delta = weekDay === 0 ? -6 : 1 - weekDay;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
