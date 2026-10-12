import { describe, expect, it } from "vitest";

import { analyzeProducts, formatBasisPoints, type AnalysisLine } from "./recette-analysis.js";

const lines: AnalysisLine[] = [
  {
    productId: "0199c0a0-0000-7000-8000-00000000d00d",
    name: "Café express",
    kind: "BAR",
    soldQuantity: 2,
    revenueMillimes: 3500,
    voidedQuantity: 0,
    voidedMillimes: 0,
    unitCostMillimes: 500,
  },
  {
    productId: "0199c0a0-0000-7000-8000-00000000d00e",
    name: "Couscous au poisson",
    kind: "KITCHEN",
    soldQuantity: 1,
    revenueMillimes: 28_000,
    voidedQuantity: 0,
    voidedMillimes: 0,
    unitCostMillimes: 10_000,
  },
  {
    productId: "0199c0a0-0000-7000-8000-00000000d00f",
    name: "Brik",
    kind: "KITCHEN",
    soldQuantity: 1,
    revenueMillimes: 4500,
    voidedQuantity: 1,
    voidedMillimes: 4500,
    unitCostMillimes: null,
  },
];

describe("analyzeProducts", () => {
  it("ranks sales, void rate, and margin against the other products", () => {
    const view = analyzeProducts(lines, "ALL");
    expect(view.rows.map((row) => row.name)).toEqual([
      "Couscous au poisson",
      "Brik",
      "Café express",
    ]);
    expect(view.topBar?.name).toBe("Café express");
    expect(view.topKitchen?.name).toBe("Couscous au poisson");
    const brik = view.rows[1];
    expect(brik?.voidRateBp).toBe(5000);
    expect(brik?.marginMillimes).toBeNull();
    expect(brik?.marginShareBp).toBeNull();
    const couscous = view.rows[0];
    expect(couscous?.revenueShareBp).toBe(7778);
    expect(couscous?.marginMillimes).toBe(18_000);
    expect(couscous?.marginShareBp).toBe(8780);
    const coffee = view.rows[2];
    expect(coffee?.marginMillimes).toBe(2500);
    expect(coffee?.marginShareBp).toBe(1220);
    expect(view.knownMarginMillimes).toBe(20_500);
    expect(view.missingRecipeCount).toBe(1);
    expect(view.voidRateBp).toBe(2000);
    expect(formatBasisPoints(5000)).toBe("50,0 %");
    expect(formatBasisPoints(1220)).toBe("12,2 %");
  });

  it("limits the comparison to drinks or the kitchen", () => {
    const drinks = analyzeProducts(lines, "BAR");
    expect(drinks.rows.map((row) => row.name)).toEqual(["Café express"]);
    expect(drinks.rows[0]?.revenueShareBp).toBe(10_000);
    expect(drinks.rows[0]?.marginShareBp).toBe(10_000);
    expect(drinks.topKitchen).toBeNull();
    const kitchen = analyzeProducts(lines, "KITCHEN");
    expect(kitchen.rows.map((row) => row.name)).toEqual(["Couscous au poisson", "Brik"]);
    expect(kitchen.topBar).toBeNull();
    expect(kitchen.topKitchen?.name).toBe("Couscous au poisson");
  });
});
