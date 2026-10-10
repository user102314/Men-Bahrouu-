import { openDatabase } from "./connection.js";
import { assertNotProduction } from "./dev-only.js";

try {
  assertNotProduction(process.env.NODE_ENV, "reset the database");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const sql = openDatabase(true);
await sql`drop schema if exists public cascade`;
await sql`drop schema if exists drizzle cascade`;
await sql`create schema public`;
await sql.end();
console.log("Database schema reset.");
