import { describe, expect, it } from "vitest";

import { DomainError } from "./errors.js";
import {
  assertCanViewOrder,
  statusAfterActiveCount,
  statusAfterSend,
  statusAfterServed,
} from "./rules.js";
import { activeTotal } from "./totals.js";

describe("order transitions", () => {
  it("sends a draft and a served order when a line is still unsent", () => {
    expect(statusAfterSend("DRAFT", 1)).toBe("SENT");
    expect(statusAfterSend("SERVED", 2)).toBe("SENT");
    expect(statusAfterSend("SENT", 0)).toBe("UNCHANGED");
  });

  it("rejects a send with nothing to print and a served mark from the wrong status", () => {
    expect(() => statusAfterSend("DRAFT", 0)).toThrow(DomainError);
    expect(() => statusAfterSend("PAID", 1)).toThrow(DomainError);
    expect(() => statusAfterServed("DRAFT")).toThrow(DomainError);
    expect(statusAfterServed("SENT")).toBe("SERVED");
  });

  it("cancels only when no active line remains and the order is not paid", () => {
    expect(statusAfterActiveCount("SENT", 0)).toBe("CANCELLED");
    expect(statusAfterActiveCount("DRAFT", 0)).toBe("CANCELLED");
    expect(statusAfterActiveCount("SENT", 1)).toBe("SENT");
    expect(() => statusAfterActiveCount("PAID", 0)).toThrow(DomainError);
  });

  it("hides another waiter's order and shows every order to a cashier", () => {
    expect(() => assertCanViewOrder("WAITER", "server-a", "server-b")).toThrow(DomainError);
    expect(() => assertCanViewOrder("WAITER", "server-a", "server-a")).not.toThrow();
    expect(() => assertCanViewOrder("CASHIER", "server-a", "cashier")).not.toThrow();
  });
});

describe("activeTotal", () => {
  it("sums active lines and ignores voided ones", () => {
    expect(
      activeTotal([
        { status: "ACTIVE", unitPriceMillimes: 2000, quantity: 2 },
        { status: "VOIDED", unitPriceMillimes: 9000, quantity: 1 },
        { status: "ACTIVE", unitPriceMillimes: 1500, quantity: 1 },
      ]),
    ).toBe(5500);
  });
});
