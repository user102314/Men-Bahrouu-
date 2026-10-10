import { describe, expect, it } from "vitest";

import { businessDate } from "./business-date.js";

const ZONE = "Africa/Tunis";

describe("businessDate", () => {
  it("keeps late evening and rolls the early morning back to the previous day", () => {
    expect(businessDate(zoned("2026-10-10", "23:59"), 5)).toBe("2026-10-10");
    expect(businessDate(zoned("2026-10-11", "00:30"), 5)).toBe("2026-10-10");
    expect(businessDate(zoned("2026-10-11", "04:59"), 5)).toBe("2026-10-10");
    expect(businessDate(zoned("2026-10-11", "05:00"), 5)).toBe("2026-10-11");
  });

  it("follows Africa/Tunis across the 2008 daylight-saving transitions", () => {
    // Spring forward: 02:00 local is skipped, so 05:00 is only four absolute hours after midnight.
    expect(businessDate(zoned("2008-03-30", "05:00"), 5)).toBe("2008-03-29");
    expect(businessDate(zoned("2008-03-30", "06:00"), 5)).toBe("2008-03-30");
    // Fall back: the extra hour means 04:59 local is already five absolute hours after the previous midnight.
    expect(businessDate(zoned("2008-10-26", "00:30"), 5)).toBe("2008-10-25");
    expect(businessDate(zoned("2008-10-26", "04:59"), 5)).toBe("2008-10-26");
    expect(businessDate(zoned("2008-10-26", "05:00"), 5)).toBe("2008-10-26");
  });

  it("rejects a cutoff outside 0-23", () => {
    expect(() => businessDate(new Date("2026-10-10T12:00:00Z"), 24)).toThrow(/Cutoff hour/);
  });
});

/** Civil time in Africa/Tunis, resolved through the timezone database. */
function zoned(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = format.formatToParts(new Date(utc));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const got = Date.UTC(
      read("year"),
      read("month") - 1,
      read("day"),
      read("hour"),
      read("minute"),
    );
    const want = Date.UTC(year, month - 1, day, hour, minute);
    if (got === want) {
      return new Date(utc);
    }
    utc += want - got;
  }
  return new Date(utc);
}
