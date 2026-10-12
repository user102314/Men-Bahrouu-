import { businessDate, tndToMillimes } from "@resto/shared";
import type postgres from "postgres";

import { DEFAULT_VAT_RATE_BP } from "../../config/vat.js";
import { SEED_IDS } from "./seed-ids.js";

const VAT = DEFAULT_VAT_RATE_BP;

interface MenuCategory {
  code: string;
  id: string;
  nameFr: string;
  nameAr: string;
  stationId: string;
  sortOrder: number;
}

export interface MenuProduct {
  code: string;
  id: string;
  categoryId: string;
  nameFr: string;
  nameAr: string;
  priceMillimes: number;
  vatRateBp: number;
  sortOrder: number;
}

const CATEGORIES: readonly MenuCategory[] = [
  {
    code: "starters",
    id: SEED_IDS.starters,
    nameFr: "Entrées",
    nameAr: "مقبلات",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 1,
  },
  {
    code: "tunisian",
    id: SEED_IDS.tunisian,
    nameFr: "Spécialités tunisiennes",
    nameAr: "أكلات تونسية",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 2,
  },
  {
    code: "salads",
    id: SEED_IDS.salads,
    nameFr: "Salades",
    nameAr: "سلاطات",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 3,
  },
  {
    code: "seafood",
    id: SEED_IDS.seafood,
    nameFr: "Fruits de mer",
    nameAr: "غلال البحر",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 4,
  },
  {
    code: "fish",
    id: SEED_IDS.fish,
    nameFr: "Poissons grillés",
    nameAr: "أسماك مشوية",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 5,
  },
  {
    code: "pasta",
    id: SEED_IDS.pasta,
    nameFr: "Pâtes et risotto",
    nameAr: "باستا وريزوتو",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 6,
  },
  {
    code: "meat",
    id: SEED_IDS.meat,
    nameFr: "Viandes et volailles",
    nameAr: "لحوم ودواجن",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 7,
  },
  {
    code: "kids",
    id: SEED_IDS.kids,
    nameFr: "Menu enfant",
    nameAr: "قائمة الأطفال",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 8,
  },
  {
    code: "sides",
    id: SEED_IDS.sides,
    nameFr: "Accompagnements",
    nameAr: "مرافقات",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 9,
  },
  {
    code: "desserts",
    id: SEED_IDS.desserts,
    nameFr: "Desserts",
    nameAr: "حلويات",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 10,
  },
  {
    code: "cold-drinks",
    id: SEED_IDS.coldDrinks,
    nameFr: "Boissons fraîches",
    nameAr: "مشروبات باردة",
    stationId: SEED_IDS.stationBar,
    sortOrder: 11,
  },
  {
    code: "hot-drinks",
    id: SEED_IDS.hotDrinks,
    nameFr: "Boissons chaudes",
    nameAr: "مشروبات ساخنة",
    stationId: SEED_IDS.stationBar,
    sortOrder: 12,
  },
];

/** Prices are TND with a decimal point. Empty VAT in the source file uses the site default, 7%. */
const ROWS: readonly {
  code: string;
  category: string;
  nameFr: string;
  nameAr: string;
  priceTnd: string;
  sortOrder: number;
}[] = [
  {
    code: "brik-thon",
    category: "starters",
    nameFr: "Brik thon",
    nameAr: "بريك تن",
    priceTnd: "5.500",
    sortOrder: 1,
  },
  {
    code: "brik-chevrette",
    category: "starters",
    nameFr: "Brik chevrette",
    nameAr: "بريك بالشوفرات",
    priceTnd: "6.500",
    sortOrder: 2,
  },
  {
    code: "kafteji",
    category: "tunisian",
    nameFr: "Kafteji",
    nameAr: "كفتاجي",
    priceTnd: "8.000",
    sortOrder: 1,
  },
  {
    code: "ojja-chevrettes",
    category: "tunisian",
    nameFr: "Ojja chevrettes",
    nameAr: "عجة شفرات",
    priceTnd: "29.000",
    sortOrder: 2,
  },
  {
    code: "ojja-fruits-de-mer",
    category: "tunisian",
    nameFr: "Ojja fruits de mer",
    nameAr: "عجة غلال البحر",
    priceTnd: "33.000",
    sortOrder: 3,
  },
  {
    code: "salade-tunisienne",
    category: "salads",
    nameFr: "Salade tunisienne",
    nameAr: "سلاطة تونسية",
    priceTnd: "5.000",
    sortOrder: 1,
  },
  {
    code: "salade-tunisienne-thon",
    category: "salads",
    nameFr: "Salade tunisienne au thon",
    nameAr: "سلاطة تونسية بالتن",
    priceTnd: "10.000",
    sortOrder: 2,
  },
  {
    code: "salade-mechouia",
    category: "salads",
    nameFr: "Salade méchouia",
    nameAr: "سلاطة مشوية",
    priceTnd: "6.000",
    sortOrder: 3,
  },
  {
    code: "salade-mechouia-thon",
    category: "salads",
    nameFr: "Salade méchouia au thon",
    nameAr: "سلاطة مشوية بالتن",
    priceTnd: "10.000",
    sortOrder: 4,
  },
  {
    code: "salade-cesar",
    category: "salads",
    nameFr: "Salade César",
    nameAr: "سلاطة سيزار",
    priceTnd: "20.000",
    sortOrder: 5,
  },
  {
    code: "salade-pecheur",
    category: "salads",
    nameFr: "Salade pêcheur",
    nameAr: "سلاطة الصياد",
    priceTnd: "25.000",
    sortOrder: 6,
  },
  {
    code: "cocotte-moules-ail",
    category: "seafood",
    nameFr: "Cocotte de moules sautés à l'ail",
    nameAr: "مول سوتيه بالثوم",
    priceTnd: "25.000",
    sortOrder: 1,
  },
  {
    code: "cocotte-moules-creme",
    category: "seafood",
    nameFr: "Cocotte de moules sautés à la crème",
    nameAr: "مول سوتيه بالكريم",
    priceTnd: "28.000",
    sortOrder: 2,
  },
  {
    code: "calamars-panes",
    category: "seafood",
    nameFr: "Calamars panés",
    nameAr: "كلامار مبطن",
    priceTnd: "20.000",
    sortOrder: 3,
  },
  {
    code: "crevettes-panees-grillees",
    category: "seafood",
    nameFr: "Crevettes panées / grillées",
    nameAr: "كروفات مبطن / مشوي",
    priceTnd: "36.000",
    sortOrder: 4,
  },
  {
    code: "fruits-de-mer-sautes-ail",
    category: "seafood",
    nameFr: "Fruits de mer sautés à l'ail",
    nameAr: "غلال البحر سوتيه بالثوم",
    priceTnd: "36.000",
    sortOrder: 5,
  },
  {
    code: "fruits-de-mer-sautes-creme",
    category: "seafood",
    nameFr: "Fruits de mer sautés à la crème",
    nameAr: "غلال البحر سوتيه بالكريم",
    priceTnd: "39.000",
    sortOrder: 6,
  },
  {
    code: "gargoulette-fruits-de-mer",
    category: "seafood",
    nameFr: "Gargoulette fruits de mer",
    nameAr: "قلة غلال البحر",
    priceTnd: "40.000",
    sortOrder: 7,
  },
  {
    code: "flouka-2-pers",
    category: "seafood",
    nameFr: "Flouka fruits de mer (2 pers.)",
    nameAr: "فلوكة غلال البحر (2 أشخاص)",
    priceTnd: "80.000",
    sortOrder: 8,
  },
  {
    code: "flouka-4-pers",
    category: "seafood",
    nameFr: "Flouka fruits de mer (4 pers.)",
    nameAr: "فلوكة غلال البحر (4 أشخاص)",
    priceTnd: "150.000",
    sortOrder: 9,
  },
  {
    code: "daurade-grillee",
    category: "fish",
    nameFr: "Daurade grillée",
    nameAr: "وراطة مشوية",
    priceTnd: "23.000",
    sortOrder: 1,
  },
  {
    code: "loup-grille",
    category: "fish",
    nameFr: "Loup grillé",
    nameAr: "قاروص مشوي",
    priceTnd: "26.000",
    sortOrder: 2,
  },
  {
    code: "penne-chevrette-sauce-blanche",
    category: "pasta",
    nameFr: "Penne chevrette sauce blanche",
    nameAr: "بلومة صلصة بيضاء بالشفرات",
    priceTnd: "30.000",
    sortOrder: 1,
  },
  {
    code: "tagliatelle-chevrettes-sauce-rosee",
    category: "pasta",
    nameFr: "Tagliatelle chevrettes sauce rosée",
    nameAr: "تالياتالي شفرات صلصة وردية",
    priceTnd: "30.000",
    sortOrder: 2,
  },
  {
    code: "spaghetti-chevrettes",
    category: "pasta",
    nameFr: "Spaghetti chevrettes",
    nameAr: "سباغيتي شفرات",
    priceTnd: "29.000",
    sortOrder: 3,
  },
  {
    code: "spaghetti-fruits-de-mer",
    category: "pasta",
    nameFr: "Spaghetti fruits de mer",
    nameAr: "سباغيتي غلال البحر",
    priceTnd: "35.000",
    sortOrder: 4,
  },
  {
    code: "risotto-sauce-blanche-rosee",
    category: "pasta",
    nameFr: "Risotto sauce blanche / rosée",
    nameAr: "ريزوتو صلصة بيضاء/وردية",
    priceTnd: "35.000",
    sortOrder: 5,
  },
  {
    code: "spaghetti-bolognaise",
    category: "pasta",
    nameFr: "Spaghetti bolognaise",
    nameAr: "سباغيتي لحم مفروم",
    priceTnd: "30.000",
    sortOrder: 6,
  },
  {
    code: "escalope-panee",
    category: "meat",
    nameFr: "Escalope panée",
    nameAr: "اسكالوب مبطن",
    priceTnd: "25.000",
    sortOrder: 1,
  },
  {
    code: "emince-poulet-creme",
    category: "meat",
    nameFr: "Émincé de poulet à la crème",
    nameAr: "اسكالوب بالكريمه",
    priceTnd: "30.000",
    sortOrder: 2,
  },
  {
    code: "chicken-nuggets",
    category: "kids",
    nameFr: "Chicken nuggets (menu enfant)",
    nameAr: "ناغتس دجاج (قائمة الأطفال)",
    priceTnd: "18.000",
    sortOrder: 1,
  },
  {
    code: "plat-frites",
    category: "sides",
    nameFr: "Plat frites",
    nameAr: "صحن فريت",
    priceTnd: "6.000",
    sortOrder: 1,
  },
  {
    code: "tabouna",
    category: "sides",
    nameFr: "Tabouna",
    nameAr: "طابونة",
    priceTnd: "2.500",
    sortOrder: 2,
  },
  {
    code: "fruits-de-saison",
    category: "desserts",
    nameFr: "Fruits de saison",
    nameAr: "غلال الموسم",
    priceTnd: "5.000",
    sortOrder: 1,
  },
  {
    code: "citronnade",
    category: "cold-drinks",
    nameFr: "Citronnade",
    nameAr: "عصير ليمون",
    priceTnd: "4.000",
    sortOrder: 1,
  },
  {
    code: "boisson-gazeuse",
    category: "cold-drinks",
    nameFr: "Boisson gazeuse",
    nameAr: "مشروب غازي",
    priceTnd: "3.000",
    sortOrder: 2,
  },
  {
    code: "eau-minerale-1l",
    category: "cold-drinks",
    nameFr: "Eau minérale 1 L",
    nameAr: "ماء معدني",
    priceTnd: "3.000",
    sortOrder: 3,
  },
  {
    code: "the-amandes",
    category: "hot-drinks",
    nameFr: "Thé aux amandes",
    nameAr: "تاي باللوز",
    priceTnd: "2.500",
    sortOrder: 1,
  },
];

const categoryByCode = new Map(CATEGORIES.map((category) => [category.code, category]));

export const MENU_PRODUCTS: readonly MenuProduct[] = ROWS.map((row, index) => {
  const category = categoryByCode.get(row.category);
  if (!category) {
    throw new Error(`Unknown menu category ${row.category}`);
  }
  return {
    code: row.code,
    id: `0199c0a0-0000-7000-8000-${(0x450 + index).toString(16).padStart(12, "0")}`,
    categoryId: category.id,
    nameFr: row.nameFr,
    nameAr: row.nameAr,
    priceMillimes: tndToMillimes(row.priceTnd),
    vatRateBp: VAT,
    sortOrder: row.sortOrder,
  };
});

const productByCode = new Map(MENU_PRODUCTS.map((product) => [product.code, product]));

export function menuProduct(code: string): MenuProduct {
  const product = productByCode.get(code);
  if (!product) {
    throw new Error(`Unknown menu product ${code}`);
  }
  return product;
}

export function defaultDailySpecialIds(): [string, string] {
  return [menuProduct("brik-thon").id, menuProduct("kafteji").id];
}

export async function syncServiceMenu(
  sql: postgres.Sql,
): Promise<{ products: number; removed: number; retired: number }> {
  const siteId = SEED_IDS.site;
  const categoryRows = CATEGORIES.map((category) => ({
    id: category.id,
    site_id: siteId,
    name_fr: category.nameFr,
    name_ar: category.nameAr,
    station_id: category.stationId,
    sort_order: category.sortOrder,
    is_active: true,
  }));
  await sql`
    insert into categories ${sql(categoryRows, "id", "site_id", "name_fr", "name_ar", "station_id", "sort_order", "is_active")}
    on conflict (id) do update set
      name_fr = excluded.name_fr,
      name_ar = excluded.name_ar,
      station_id = excluded.station_id,
      sort_order = excluded.sort_order,
      is_active = true,
      updated_at = now()
  `;
  const productRows = MENU_PRODUCTS.map((product) => ({
    id: product.id,
    site_id: siteId,
    category_id: product.categoryId,
    name_fr: product.nameFr,
    name_ar: product.nameAr,
    price_millimes: product.priceMillimes,
    vat_rate_bp: product.vatRateBp,
    is_available: true,
    is_active: true,
    sort_order: product.sortOrder,
  }));
  await sql`
    insert into products ${sql(
      productRows,
      "id",
      "site_id",
      "category_id",
      "name_fr",
      "name_ar",
      "price_millimes",
      "vat_rate_bp",
      "is_available",
      "is_active",
      "sort_order",
    )}
    on conflict (id) do update set
      category_id = excluded.category_id,
      name_fr = excluded.name_fr,
      name_ar = excluded.name_ar,
      price_millimes = excluded.price_millimes,
      vat_rate_bp = excluded.vat_rate_bp,
      is_available = true,
      is_active = true,
      sort_order = excluded.sort_order,
      updated_at = now()
  `;
  const productIds = MENU_PRODUCTS.map((product) => product.id);
  const categoryIds = CATEGORIES.map((category) => category.id);
  await sql`
    delete from product_ingredients
    where product_id in (
      select id from products where site_id = ${siteId} and id not in ${sql(productIds)}
    )
  `;
  const removed = await sql`
    delete from products
    where site_id = ${siteId}
      and id not in ${sql(productIds)}
      and category_id <> ${SEED_IDS.daily}
      and id not in (select product_id from order_items)
  `;
  const retired = await sql`
    update products
    set is_active = false, is_available = false, updated_at = now()
    where site_id = ${siteId} and id not in ${sql(productIds)} and is_active = true
      and category_id <> ${SEED_IDS.daily}
  `;
  await sql`
    update categories
    set is_active = false, updated_at = now()
    where site_id = ${siteId} and id not in ${sql(categoryIds)} and id <> ${SEED_IDS.daily} and is_active = true
  `;
  await sql`
    delete from categories
    where site_id = ${siteId}
      and is_active = false
      and id not in (select category_id from products)
  `;
  await refreshDailySpecials(sql, siteId);
  return { products: MENU_PRODUCTS.length, removed: removed.count, retired: retired.count };
}

async function refreshDailySpecials(sql: postgres.Sql, siteId: string): Promise<void> {
  const rows = await sql<{ value: { businessDate?: unknown; productIds?: unknown } }[]>`
    select value from settings where site_id = ${siteId} and key = 'dailySpecials'
  `;
  const raw = rows[0]?.value;
  const current =
    typeof raw === "string"
      ? (JSON.parse(raw) as { businessDate?: unknown; productIds?: unknown })
      : raw;
  if (!current || typeof current !== "object") {
    return;
  }
  const liveRows = await sql<{ id: string }[]>`
    select id from products where site_id = ${siteId} and is_active = true
  `;
  const live = new Set(liveRows.map((row) => row.id));
  const ids = Array.isArray(current.productIds)
    ? current.productIds.filter((id): id is string => typeof id === "string")
    : [];
  const kept = ids.filter((id) => live.has(id));
  if (kept.length === ids.length) {
    return;
  }
  const productIds = kept.length > 0 ? kept : [...defaultDailySpecialIds()];
  const value = JSON.stringify({ businessDate: businessDate(new Date(), 5), productIds });
  await sql`
    update settings
    set value = ${value}::jsonb, updated_at = now()
    where site_id = ${siteId} and key = 'dailySpecials'
  `;
}
