import { describe, expect, it } from "vitest";

import { assertNotProduction } from "./dev-only.js";

describe("assertNotProduction", () => {
  it("refuses production and allows every other environment", () => {
    expect(() => assertNotProduction("production", "reset the database")).toThrow(/production/);
    expect(() => assertNotProduction("development", "seed the database")).not.toThrow();
    expect(() => assertNotProduction(undefined, "seed the database")).not.toThrow();
  });
});
