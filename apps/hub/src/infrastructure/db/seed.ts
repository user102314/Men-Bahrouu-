import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";

import { DEFAULT_VAT_RATE_BP } from "../../config/vat.js";
import { hashSecret } from "../auth/argon2-hasher.js";
import { openDatabase } from "./connection.js";
import { assertNotProduction } from "./dev-only.js";
import { SEED_IDS, tableId } from "./seed-ids.js";
import {
  categories,
  devices,
  floorTables,
  printers,
  products,
  sites,
  stations,
  users,
} from "./schema/index.js";

const DEV_PASSWORD = "Admin#2026dev";
const DEV_PINS = {
  sonia: "4321",
  mohamed: "1234",
  amira: "2468",
  youssef: "1357",
} as const;

try {
  assertNotProduction(process.env.NODE_ENV, "seed the database");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const siteId = process.env.SITE_ID;
if (siteId !== SEED_IDS.site) {
  console.error("SITE_ID must be the development site id from .env.example.");
  process.exit(1);
}

const sql = openDatabase();
const db = drizzle(sql);

const existing = await sql<{ id: string }[]>`select id from sites where id = ${siteId}`;
if (existing.length > 0) {
  console.log("Database already seeded. Device tokens are not printed again.");
  console.log("If .devices.dev.json is missing, run pnpm db:reset on this development database.");
  await sql.end();
  process.exit(0);
}

const [passwordHash, soniaPin, mohamedPin, amiraPin, youssefPin] = await Promise.all([
  hashSecret(DEV_PASSWORD),
  hashSecret(DEV_PINS.sonia),
  hashSecret(DEV_PINS.mohamed),
  hashSecret(DEV_PINS.amira),
  hashSecret(DEV_PINS.youssef),
]);

const tablet = createDeviceToken();
const cashierPc = createDeviceToken();

await db.insert(sites).values({
  id: siteId,
  name: "Men Bahrouu",
  address: "Tunis",
});

await db.insert(users).values([
  {
    id: SEED_IDS.karim,
    siteId,
    displayName: "Karim",
    role: "ADMIN",
    email: "admin@resto.local",
    passwordHash,
  },
  {
    id: SEED_IDS.sonia,
    siteId,
    displayName: "Sonia",
    role: "CASHIER",
    pinHash: soniaPin,
  },
  {
    id: SEED_IDS.mohamed,
    siteId,
    displayName: "Mohamed",
    role: "WAITER",
    pinHash: mohamedPin,
  },
  {
    id: SEED_IDS.amira,
    siteId,
    displayName: "Amira",
    role: "WAITER",
    pinHash: amiraPin,
  },
  {
    id: SEED_IDS.youssef,
    siteId,
    displayName: "Youssef",
    role: "WAITER",
    pinHash: youssefPin,
  },
]);

await db.insert(printers).values([
  { id: SEED_IDS.printerBar, siteId, name: "Bar", host: "127.0.0.1", port: 9101 },
  { id: SEED_IDS.printerKitchen, siteId, name: "Cuisine", host: "127.0.0.1", port: 9102 },
]);

await db.insert(stations).values([
  {
    id: SEED_IDS.stationBar,
    siteId,
    kind: "BAR",
    name: "Bar",
    printerId: SEED_IDS.printerBar,
  },
  {
    id: SEED_IDS.stationKitchen,
    siteId,
    kind: "KITCHEN",
    name: "Cuisine",
    printerId: SEED_IDS.printerKitchen,
  },
]);

await db.insert(categories).values([
  {
    id: SEED_IDS.hotDrinks,
    siteId,
    nameFr: "Boissons chaudes",
    nameAr: "مشروبات ساخنة",
    stationId: SEED_IDS.stationBar,
    sortOrder: 1,
  },
  {
    id: SEED_IDS.coldDrinks,
    siteId,
    nameFr: "Boissons fraîches",
    nameAr: "مشروبات باردة",
    stationId: SEED_IDS.stationBar,
    sortOrder: 2,
  },
  {
    id: SEED_IDS.starters,
    siteId,
    nameFr: "Entrées",
    nameAr: "مقبلات",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 3,
  },
  {
    id: SEED_IDS.mains,
    siteId,
    nameFr: "Plats",
    nameAr: "أطباق",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 4,
  },
  {
    id: SEED_IDS.fish,
    siteId,
    nameFr: "Poissons",
    nameAr: "أسماك",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 5,
  },
  {
    id: SEED_IDS.pasta,
    siteId,
    nameFr: "Pâtes et pizzas",
    nameAr: "معكرونة وبيتزا",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 6,
  },
  {
    id: SEED_IDS.desserts,
    siteId,
    nameFr: "Desserts",
    nameAr: "حلويات",
    stationId: SEED_IDS.stationKitchen,
    sortOrder: 7,
  },
]);

const vatRateBp = DEFAULT_VAT_RATE_BP;
await db
  .insert(products)
  .values([
    product(
      siteId,
      vatRateBp,
      SEED_IDS.cafe,
      SEED_IDS.hotDrinks,
      "Café express",
      "قهوة إكسبريس",
      2_000,
      1,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.mintTea,
      SEED_IDS.hotDrinks,
      "Thé à la menthe",
      "شاي بالنعناع",
      2_500,
      2,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.lemonade,
      SEED_IDS.coldDrinks,
      "Citronnade",
      "ليموناضة",
      6_000,
      1,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.orangeJuice,
      SEED_IDS.coldDrinks,
      "Jus d'orange frais",
      "عصير برتقال طازج",
      7_000,
      2,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.water,
      SEED_IDS.coldDrinks,
      "Eau minérale",
      "ماء معدني",
      1_500,
      3,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.brik,
      SEED_IDS.starters,
      "Brik à l'œuf",
      "بريك بالبيض",
      4_500,
      1,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.mechouia,
      SEED_IDS.starters,
      "Salade méchouia",
      "سلطة مشوية",
      8_000,
      2,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.tunisianSalad,
      SEED_IDS.starters,
      "Salade tunisienne",
      "سلطة تونسية",
      7_000,
      3,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.fishCouscous,
      SEED_IDS.fish,
      "Couscous au poisson",
      "كسكس بالسمك",
      28_000,
      1,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.grilledFish,
      SEED_IDS.fish,
      "Poisson grillé",
      "سمك مشوي",
      32_000,
      2,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.escalope,
      SEED_IDS.mains,
      "Escalope grillée",
      "إسكالوب مشوي",
      18_000,
      1,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.seafoodPasta,
      SEED_IDS.pasta,
      "Spaghetti aux fruits de mer",
      "سباغيتي بثمار البحر",
      24_000,
      1,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.royalPizza,
      SEED_IDS.pasta,
      "Pizza royale",
      "بيتزا رويال",
      15_000,
      2,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.tiramisu,
      SEED_IDS.desserts,
      "Tiramisu",
      "تيراميسو",
      9_000,
      1,
    ),
    product(
      siteId,
      vatRateBp,
      SEED_IDS.assida,
      SEED_IDS.desserts,
      "Assidat zgougou",
      "عصيدة الزقوقو",
      7_000,
      2,
    ),
  ]);

const salle = Array.from({ length: 12 }, (_, index) => ({
  id: tableId(index),
  siteId,
  label: `T${index + 1}`,
  zone: "Salle",
  seats: 4,
}));
const terrasse = Array.from({ length: 6 }, (_, index) => ({
  id: tableId(12 + index),
  siteId,
  label: `S${index + 1}`,
  zone: "Terrasse",
  seats: 4,
}));
await db.insert(floorTables).values([...salle, ...terrasse]);

await db.insert(devices).values([
  {
    id: SEED_IDS.tablet,
    siteId,
    name: "Tablette salle",
    type: "TABLET",
    tokenHash: tablet.tokenHash,
  },
  {
    id: SEED_IDS.cashierPc,
    siteId,
    name: "PC caisse",
    type: "CASHIER_PC",
    tokenHash: cashierPc.tokenHash,
  },
]);

console.log("");
console.log("ATTENTION : identifiants de développement uniquement. Ne pas utiliser en production.");
console.log(`ADMIN  Karim   admin@resto.local  ${DEV_PASSWORD}`);
console.log(`CASHIER Sonia  PIN ${DEV_PINS.sonia}`);
console.log(`WAITER Mohamed PIN ${DEV_PINS.mohamed}`);
console.log(`WAITER Amira   PIN ${DEV_PINS.amira}`);
console.log(`WAITER Youssef PIN ${DEV_PINS.youssef}`);
console.log(`TABLET     ${SEED_IDS.tablet}  token ${tablet.token}`);
console.log(`CASHIER_PC ${SEED_IDS.cashierPc}  token ${cashierPc.token}`);
const devicesFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../.devices.dev.json",
);
writeFileSync(
  devicesFile,
  `${JSON.stringify({ tablet: tablet.token, cashierPc: cashierPc.token }, null, 2)}\n`,
  { encoding: "utf8", mode: 0o600 },
);
console.log(`Jetons de développement enregistrés dans ${devicesFile} (fichier ignoré par Git).`);
console.log("Ces jetons d'appareils ne seront plus affichés.");
console.log("");

await sql.end();

function product(
  site: string,
  vat: number,
  id: string,
  categoryId: string,
  nameFr: string,
  nameAr: string,
  priceMillimes: number,
  sortOrder: number,
) {
  return {
    id,
    siteId: site,
    categoryId,
    nameFr,
    nameAr,
    priceMillimes,
    vatRateBp: vat,
    sortOrder,
  };
}

function createDeviceToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}
