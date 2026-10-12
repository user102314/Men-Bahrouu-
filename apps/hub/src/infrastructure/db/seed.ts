import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { businessDate } from "@resto/shared";
import { drizzle } from "drizzle-orm/postgres-js";

import { hashSecret } from "../auth/argon2-hasher.js";
import { openDatabase } from "./connection.js";
import { assertNotProduction } from "./dev-only.js";
import { defaultDailySpecialIds, syncServiceMenu } from "./menu-catalog.js";
import { seedAdminDemo } from "./seed-admin-demo.js";
import { SEED_IDS, tableId } from "./seed-ids.js";
import { devices, floorTables, printers, sites, stations, users } from "./schema/index.js";

const DEV_PASSWORD = "Admin#2026dev";
const DEV_PINS = {
  sonia: "4321",
  nour: "2580",
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
  await ensureCashierNour(sql);
  await ensureServiceTables(sql);
  const menu = await syncServiceMenu(sql);
  await ensureDailySpecials(sql);
  console.log(`Carte du service : ${menu.products} produits.`);
  if (menu.removed > 0 || menu.retired > 0) {
    console.log(
      `Anciens produits retirés : ${menu.removed}. Conservés car déjà commandés : ${menu.retired}.`,
    );
  }
  console.log("Database already seeded. Device tokens are not printed again.");
  console.log("If .devices.dev.json is missing, run pnpm db:reset on this development database.");
  await sql.end();
  process.exit(0);
}

const [passwordHash, soniaPin, nourPin, mohamedPin, amiraPin, youssefPin] = await Promise.all([
  hashSecret(DEV_PASSWORD),
  hashSecret(DEV_PINS.sonia),
  hashSecret(DEV_PINS.nour),
  hashSecret(DEV_PINS.mohamed),
  hashSecret(DEV_PINS.amira),
  hashSecret(DEV_PINS.youssef),
]);

const tablet = createDeviceToken();
const cashierPc = createDeviceToken();
const phone = createDeviceToken();

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
    id: SEED_IDS.nour,
    siteId,
    displayName: "Nour",
    role: "CASHIER",
    pinHash: nourPin,
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

await syncServiceMenu(sql);

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
await ensureServiceTables(sql);
await ensureDailySpecials(sql);

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
  {
    id: SEED_IDS.phone,
    siteId,
    name: "Téléphone admin",
    type: "PHONE",
    tokenHash: phone.tokenHash,
  },
]);

console.log("");
console.log("ATTENTION : identifiants de développement uniquement. Ne pas utiliser en production.");
console.log(`ADMIN  Karim   admin@resto.local  ${DEV_PASSWORD}`);
console.log(`CASHIER Sonia  PIN ${DEV_PINS.sonia}`);
console.log(`CASHIER Nour    PIN ${DEV_PINS.nour}`);
console.log(`WAITER Mohamed PIN ${DEV_PINS.mohamed}`);
console.log(`WAITER Amira   PIN ${DEV_PINS.amira}`);
console.log(`WAITER Youssef PIN ${DEV_PINS.youssef}`);
console.log(`TABLET     ${SEED_IDS.tablet}  token ${tablet.token}`);
console.log(`CASHIER_PC ${SEED_IDS.cashierPc}  token ${cashierPc.token}`);
const devicesFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../.devices.dev.json",
);
const tokenFile = `${JSON.stringify({ tablet: tablet.token, cashierPc: cashierPc.token, phone: phone.token }, null, 2)}\n`;
writeFileSync(devicesFile, tokenFile, { encoding: "utf8", mode: 0o600 });
writeFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../../../.dev-device-tokens.json"),
  tokenFile,
  { encoding: "utf8", mode: 0o600 },
);
console.log(`Jetons de développement enregistrés dans ${devicesFile} (fichier ignoré par Git).`);
console.log("Ces jetons d'appareils ne seront plus affichés.");
console.log("");

await seedAdminDemo(sql, siteId);

await sql.end();

async function ensureServiceTables(db: typeof sql): Promise<void> {
  const rows = Array.from({ length: 100 }, (_, index) => {
    const number = index + 1;
    const start = Math.floor(index / 25) * 25 + 1;
    return {
      id: tableId(200 + number),
      site_id: SEED_IDS.site,
      label: String(number),
      zone: `${start}-${start + 24}`,
      seats: 4,
    };
  });
  const inserted = await db`
    insert into floor_tables ${db(rows, "id", "site_id", "label", "zone", "seats")}
    on conflict (site_id, label) do nothing
  `;
  if (inserted.count > 0) {
    console.log(`Tables 1 à 100 ajoutées : ${inserted.count}`);
  }
}

async function ensureDailySpecials(db: typeof sql): Promise<void> {
  const rows = await db<{ key: string }[]>`
    select key from settings where site_id = ${SEED_IDS.site} and key = 'dailySpecials'
  `;
  if (rows.length > 0) {
    return;
  }
  const today = businessDate(new Date(), 5);
  const value = JSON.stringify({
    businessDate: today,
    productIds: [...defaultDailySpecialIds()],
  });
  await db`
    insert into settings (site_id, key, value)
    values (${SEED_IDS.site}, 'dailySpecials', ${value}::jsonb)
  `;
  console.log(`Plat du jour ${today} : brik thon et kafteji`);
}

async function ensureCashierNour(db: typeof sql): Promise<void> {
  const rows = await db<{ id: string }[]>`select id from users where id = ${SEED_IDS.nour}`;
  if (rows.length > 0) {
    return;
  }
  const pinHash = await hashSecret(DEV_PINS.nour);
  await db`
    insert into users (id, site_id, display_name, role, pin_hash)
    values (${SEED_IDS.nour}, ${SEED_IDS.site}, 'Nour', 'CASHIER', ${pinHash})
  `;
  console.log(`CASHIER Nour ajoutée. PIN ${DEV_PINS.nour}`);
}

function createDeviceToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}
