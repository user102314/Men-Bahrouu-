import type { BaseUnit } from "./domain/enums.js";

/**
 * Weighted average cost, in millimes, of 1000 base units (g, mL, or pieces).
 * Value of stock = quantityBase * costPer1000 / 1000.
 * A new receipt updates the average with half-up integer rounding.
 * When the current quantity is zero or negative, the incoming price replaces the average:
 * the negative pile is an alert, not a cost base.
 */
export function weightedAverageCostPer1000(input: {
  currentQuantityBase: number;
  currentCostPer1000: number;
  incomingQuantityBase: number;
  incomingTotalCostMillimes: number;
}): number {
  assertBase(input.currentQuantityBase, "current quantity", true);
  assertBase(input.currentCostPer1000, "current cost", false);
  assertBase(input.incomingQuantityBase, "incoming quantity", false);
  assertBase(input.incomingTotalCostMillimes, "incoming cost", false);
  if (input.incomingQuantityBase <= 0) {
    throw new Error("Incoming quantity must be positive");
  }
  const incoming = BigInt(input.incomingQuantityBase);
  const incomingValueTimes1000 = BigInt(input.incomingTotalCostMillimes) * 1000n;
  if (input.currentQuantityBase <= 0) {
    return roundDiv(incomingValueTimes1000, incoming);
  }
  const current = BigInt(input.currentQuantityBase);
  const next = current + incoming;
  const numerator = current * BigInt(input.currentCostPer1000) + incomingValueTimes1000;
  return roundDiv(numerator, next);
}

/** Cost of a recipe line: quantityBase * costPer1000 / 1000, half-up. */
export function lineCostMillimes(quantityBase: number, costPer1000: number): number {
  assertBase(quantityBase, "quantity", false);
  assertBase(costPer1000, "cost", false);
  if (quantityBase < 0) {
    throw new Error("Quantity must be positive");
  }
  return roundDiv(BigInt(quantityBase) * BigInt(costPer1000), 1000n);
}

/**
 * Convert a display quantity into an integer base quantity.
 * Kilograms and litres allow up to 3 decimals (1 g or 1 mL). Grams, millilitres, and pieces are integers.
 */
export function toBaseQuantity(input: string, displayUnit: "KG" | "G" | "L" | "ML" | "PIECE"): {
  baseUnit: BaseUnit;
  quantityBase: number;
} {
  const scaled = parseScaled(input, displayUnit === "KG" || displayUnit === "L" ? 3 : 0);
  if (displayUnit === "KG") {
    return { baseUnit: "G", quantityBase: scaled };
  }
  if (displayUnit === "L") {
    return { baseUnit: "ML", quantityBase: scaled };
  }
  if (displayUnit === "G") {
    return { baseUnit: "G", quantityBase: scaled };
  }
  if (displayUnit === "ML") {
    return { baseUnit: "ML", quantityBase: scaled };
  }
  return { baseUnit: "PIECE", quantityBase: scaled };
}

/** Format a base quantity for display. 1500 g → `1,500 kg` when the caller asks for kilograms. */
export function formatBaseQuantity(quantityBase: number, baseUnit: BaseUnit, asKiloOrLitre = false): string {
  assertBase(quantityBase, "quantity", true);
  if (!asKiloOrLitre || baseUnit === "PIECE") {
    return `${quantityBase} ${label(baseUnit)}`;
  }
  const whole = Math.trunc(quantityBase / 1000);
  const fraction = String(Math.abs(quantityBase % 1000)).padStart(3, "0").replace(/0+$/, "");
  const unit = baseUnit === "G" ? "kg" : "L";
  return fraction.length === 0 ? `${whole} ${unit}` : `${whole},${fraction} ${unit}`;
}

function label(unit: BaseUnit): string {
  if (unit === "G") {
    return "g";
  }
  if (unit === "ML") {
    return "mL";
  }
  return "pièce";
}

function parseScaled(input: string, maxDecimals: number): number {
  const trimmed = input.replace(/[\s\u00a0\u202f]/g, "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Quantity must be a non-negative number");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > maxDecimals) {
    throw new Error("Quantity is finer than the base unit");
  }
  const padded = `${fraction}${"0".repeat(maxDecimals)}`.slice(0, maxDecimals);
  const scale = 10 ** maxDecimals;
  const value = Number(whole) * scale + (padded.length === 0 ? 0 : Number(padded));
  if (!Number.isSafeInteger(value)) {
    throw new Error("Quantity is too large");
  }
  return value;
}

function roundDiv(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) {
    throw new Error("Divisor must be positive");
  }
  const rounded = (numerator + denominator / 2n) / denominator;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Cost is too large");
  }
  return Number(rounded);
}

function assertBase(value: number, label: string, allowNegative: boolean): void {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new Error(`${label} must be an integer`);
  }
}
