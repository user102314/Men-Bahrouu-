import { openDatabase } from "./connection.js";

const sql = openDatabase(true);
await sql`drop schema if exists public cascade`;
await sql`drop schema if exists drizzle cascade`;
await sql`create schema public`;
await sql.end();
console.log("Database schema reset.");
