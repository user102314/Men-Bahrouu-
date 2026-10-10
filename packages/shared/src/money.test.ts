import { describe, expect, it } from "vitest";

import {
  addMillimes,
  assertMillimes,
  formatMillimes,
  millimes,
  millimesToTnd,
  multiplyMillimes,
  tndToMillimes,
  vatPortionFromGross,
} from "./money.js";

describe("tndToMillimes", () => {
  it("parses comma decimals, dot decimals, and numbers as the same 12.5 TND", () => {
    expect(tndToMillimes("12,500")).toBe(12_500);
    expect(tndToMillimes("12.5")).toBe(12_500);
    expect(tndToMillimes(12.5)).toBe(12_500);
  });

  it("accepts a whole dinar and a single millime", () => {
    expect(tndToMillimes("2")).toBe(2_000);
    expect(tndToMillimes("0,001")).toBe(1);
    expect(tndToMillimes(0)).toBe(0);
  });

  it("treats the last separator as decimal when both comma and dot are present", () => {
    expect(tndToMillimes("1,234.5")).toBe(1_234_500);
    expect(tndToMillimes("1.234,500")).toBe(1_234_500);
  });

  it("rejects more than 3 decimal places, negatives, and non-finite values", () => {
    expect(() => tndToMillimes("12,5000")).toThrow(/3 decimal/);
    expect(() => tndToMillimes("12.5001")).toThrow(/3 decimal/);
    expect(() => tndToMillimes(-1)).toThrow(/non-negative/);
    expect(() => tndToMillimes("-0,5")).toThrow(/non-negative/);
    expect(() => tndToMillimes(Number.NaN)).toThrow(/finite/);
    expect(() => tndToMillimes(Number.POSITIVE_INFINITY)).toThrow(/finite/);
    expect(() => tndToMillimes("")).toThrow(/non-negative/);
    expect(() => tndToMillimes("abc")).toThrow(/numeric/);
  });
});

describe("formatMillimes", () => {
  it("uses latin digits and a thousands comma in French and Arabic", () => {
    expect(formatMillimes(millimes(12_500), "fr")).toBe("12,500 TND");
    expect(formatMillimes(millimes(12_500), "ar")).toBe("12,500 د.ت");
    expect(formatMillimes(millimes(500), "fr")).toBe("500 TND");
  });
});

describe("millime arithmetic", () => {
  it("converts, adds, and multiplies without fractions", () => {
    expect(millimesToTnd(tndToMillimes("12,500"))).toBe(12.5);
    expect(addMillimes(millimes(2_000), millimes(500))).toBe(2_500);
    expect(addMillimes()).toBe(0);
    expect(multiplyMillimes(millimes(2_000), 3)).toBe(6_000);
    expect(() => multiplyMillimes(millimes(100), 1.5)).toThrow(/integer/);
    expect(() => assertMillimes(1.5)).toThrow(/integer/);
    expect(() => assertMillimes(-1)).toThrow(/non-negative/);
  });

  it("rounds included VAT half up and hardcodes no rate", () => {
    expect(vatPortionFromGross(millimes(1_070), 700)).toBe(70);
    expect(vatPortionFromGross(millimes(1_000), 0)).toBe(0);
    expect(vatPortionFromGross(millimes(1), 10_000)).toBe(1);
    expect(vatPortionFromGross(millimes(2), 10_000)).toBe(1);
    expect(() => vatPortionFromGross(millimes(100), -1)).toThrow(/basis points/);
    expect(() => vatPortionFromGross(millimes(100), 1.5)).toThrow(/basis points/);
  });
});
