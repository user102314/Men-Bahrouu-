import { describe, expect, it } from "vitest";

import { presetRange } from "./period.js";

describe("business-date presets", () => {
  const noon = new Date("2026-10-10T12:00:00.000Z");

  it("uses the Tunis business date and a month that starts on the first", () => {
    expect(presetRange("today", noon, 5)).toEqual({ from: "2026-10-10", to: "2026-10-10" });
    expect(presetRange("yesterday", noon, 5)).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(presetRange("7", noon, 5)).toEqual({ from: "2026-10-04", to: "2026-10-10" });
    expect(presetRange("30", noon, 5)).toEqual({ from: "2026-09-11", to: "2026-10-10" });
    expect(presetRange("month", noon, 5)).toEqual({ from: "2026-10-01", to: "2026-10-10" });
  });
});
