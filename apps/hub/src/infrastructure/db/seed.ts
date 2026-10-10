import { openDatabase } from "./connection.js";

const sql = openDatabase();
await sql`select 1`;
await sql.end();
console.log("Database is reachable. Demo data is added in a later step.");
