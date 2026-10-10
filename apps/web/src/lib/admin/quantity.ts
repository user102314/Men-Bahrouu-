import type { BaseUnit } from "@resto/shared";

export type DisplayUnit = BaseUnit | "KG" | "L";

export function displayUnitsFor(base: BaseUnit): DisplayUnit[] {
  if (base === "G") {
    return ["G", "KG"];
  }
  if (base === "ML") {
    return ["ML", "L"];
  }
  return ["PIECE"];
}

/** Converts a natural quantity into an integer base-unit count. Grams, millilitres, and pieces stay whole. */
export function toBaseQuantity(raw: string, unit: DisplayUnit): number | null {
  const text = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(text)) {
    return null;
  }
  const [whole = "0", fraction = ""] = text.split(".");
  const scaled = Number(whole) * 1000 + Number((fraction + "000").slice(0, 3));
  if (unit === "KG" || unit === "L") {
    return scaled;
  }
  if (fraction.length > 0) {
    return null;
  }
  return Number(whole);
}
