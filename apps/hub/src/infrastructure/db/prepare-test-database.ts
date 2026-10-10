import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const rootEnv = resolve(import.meta.dirname, "../../../../../.env");

export function loadRootEnv(): void {
  if (process.env.DATABASE_URL) {
    return;
  }
  const text = readFileSync(rootEnv, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function databaseUrlFor(databaseName: string): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is required");
  }
  const url = new URL(raw);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export async function prepareTestDatabase(): Promise<void> {
  loadRootEnv();
  const admin = postgres(databaseUrlFor("resto"), { max: 1 });
  const existing = await admin`select 1 from pg_database where datname = 'resto_test'`;
  if (existing.length === 0) {
    await admin.unsafe("create database resto_test");
  }
  await admin.end();

  const test = postgres(databaseUrlFor("resto_test"), { max: 1 });
  await migrate(drizzle(test), {
    migrationsFolder: resolve(import.meta.dirname, "../../../drizzle"),
  });
  await test.end();
}

if (process.argv[1]?.endsWith("prepare-test-database.ts")) {
  await prepareTestDatabase();
  console.log("Test database resto_test is ready.");
}
