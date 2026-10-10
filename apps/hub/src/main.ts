import { readFileSync } from "node:fs";

import { loadConfig } from "./config/env.js";
import { openDatabase } from "./infrastructure/db/connection.js";
import { buildApp } from "./interfaces/http/app.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};
const config = loadConfig(process.env, pkg.version);
const sql = openDatabase();
const app = await buildApp({ sql, config });

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
