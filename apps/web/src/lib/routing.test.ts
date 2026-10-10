import { describe, expect, it } from "vitest";

import { changeDue } from "./money-view.js";
import { routingPreview } from "./routing.js";

describe("routing preview", () => {
  it("counts only the articles the next send will print", () => {
    expect(
      routingPreview([
        { quantity: 2, stationKind: "BAR", sent: false },
        { quantity: 1, stationKind: "KITCHEN", sent: false },
        { quantity: 4, stationKind: "BAR", sent: true },
      ]),
    ).toEqual({ bar: 2, kitchen: 1 });
  });
});

describe("change", () => {
  it("subtracts the order total from the cash received", () => {
    expect(changeDue(12_500, 50_000)).toBe(37_500);
    expect(changeDue(12_500, 10_000)).toBe(-2_500);
  });
});
