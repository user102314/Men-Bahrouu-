import { describe, expect, it } from "vitest";

import { corsOriginOption, isDevelopmentLanOrigin } from "./dev-cors.js";

describe("development CORS", () => {
  it("allows the local network only in development", () => {
    expect(isDevelopmentLanOrigin("http://192.168.1.20:5173")).toBe(true);
    expect(isDevelopmentLanOrigin("http://10.0.0.4:5173")).toBe(true);
    expect(isDevelopmentLanOrigin("https://192.168.1.20:5173")).toBe(false);
    const production = corsOriginOption("production", ["http://localhost:5173"]);
    expect(production).toEqual(["http://localhost:5173"]);
    const development = corsOriginOption("development", ["http://localhost:5173"]);
    expect(typeof development).toBe("function");
    if (typeof development !== "function") {
      return;
    }
    development("http://10.1.2.3:5173", (_error, allow) => {
      expect(allow).toBe(true);
    });
    development("http://8.8.8.8:5173", (_error, allow) => {
      expect(allow).toBe(false);
    });
  });
});
