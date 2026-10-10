import { describe, expect, it } from "vitest";

import { isUuid, newId } from "./ids.js";

describe("newId", () => {
  it("returns sortable uuid v7 values in creation order", () => {
    const first = newId();
    const second = newId();
    expect(isUuid(first)).toBe(true);
    expect(isUuid(second)).toBe(true);
    expect(first < second).toBe(true);
    expect(first[14]).toBe("7");
  });

  it("stays ordered across a burst of calls in the same millisecond", () => {
    const now = Date.now();
    const ids = Array.from({ length: 20 }, () => newId(now));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects values that are not uuids", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
