import { describe, expect, it } from "vitest";

import { formatBaseQuantity, lineCostMillimes, toBaseQuantity, weightedAverageCostPer1000 } from "./stock.js";

describe("weightedAverageCostPer1000", () => {
  it("replaces the average when the shelf was empty or negative", () => {
    expect(
      weightedAverageCostPer1000({
        currentQuantityBase: 0,
        currentCostPer1000: 999,
        incomingQuantityBase: 2000,
        incomingTotalCostMillimes: 8000,
      }),
    ).toBe(4000);
    expect(
      weightedAverageCostPer1000({
        currentQuantityBase: -50,
        currentCostPer1000: 1000,
        incomingQuantityBase: 1000,
        incomingTotalCostMillimes: 2500,
      }),
    ).toBe(2500);
  });

  it("weights a second receipt and rounds half-up", () => {
    // 2000 g already at 4000 millimes / 1000 g, then 1000 g for 5000 millimes.
    // Value 8000 + 5000 = 13000. Average = 13000 * 1000 / 3000 = 4333.333 → 4333.
    expect(
      weightedAverageCostPer1000({
        currentQuantityBase: 2000,
        currentCostPer1000: 4000,
        incomingQuantityBase: 1000,
        incomingTotalCostMillimes: 5000,
      }),
    ).toBe(4333);
  });

  it("stays exact for a large quantity", () => {
    expect(
      weightedAverageCostPer1000({
        currentQuantityBase: 1_000_000_000,
        currentCostPer1000: 2500,
        incomingQuantityBase: 1_000_000_000,
        incomingTotalCostMillimes: 2_500_000_000,
      }),
    ).toBe(2500);
  });
});

describe("quantities", () => {
  it("converts kilograms and litres into base units", () => {
    expect(toBaseQuantity("1,5", "KG")).toEqual({ baseUnit: "G", quantityBase: 1500 });
    expect(toBaseQuantity("0.25", "L")).toEqual({ baseUnit: "ML", quantityBase: 250 });
    expect(toBaseQuantity("12", "PIECE")).toEqual({ baseUnit: "PIECE", quantityBase: 12 });
    expect(() => toBaseQuantity("1.5", "PIECE")).toThrow(/finer/);
  });

  it("formats base quantities and prices a recipe line", () => {
    expect(formatBaseQuantity(1500, "G", true)).toBe("1,5 kg");
    expect(formatBaseQuantity(250, "ML")).toBe("250 mL");
    expect(lineCostMillimes(1500, 4000)).toBe(6000);
  });
});
