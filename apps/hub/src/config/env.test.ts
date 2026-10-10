import { describe, expect, it } from "vitest";

import { loadConfig } from "./env.js";

const valid = {
  DATABASE_URL: "postgres://resto:resto@127.0.0.1:5432/resto",
  JWT_SECRET: "dev-only-change-me-before-any-shared-use",
  PORT: "3000",
  SITE_ID: "0199c0a0-0000-7000-8000-000000000001",
  CORS_ORIGINS: "http://localhost:5173",
};

describe("loadConfig", () => {
  it("rejects a missing secret and a wildcard origin", () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: "short" })).toThrow(/Invalid configuration/);
    expect(() => loadConfig({ ...valid, CORS_ORIGINS: "*" })).toThrow(/CORS_ORIGINS/);
  });
});
