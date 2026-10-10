import { describe, expect, it } from "vitest";

import { toBaseQuantity } from "./quantity.js";

describe("toBaseQuantity", () => {
  it("converts kilograms and litres, and keeps grams whole", () => {
    expect(toBaseQuantity("1.5", "KG")).toBe(1_500);
    expect(toBaseQuantity("0.25", "L")).toBe(250);
    expect(toBaseQuantity("2", "G")).toBe(2);
    expect(toBaseQuantity("1.5", "G")).toBeNull();
  });
});
