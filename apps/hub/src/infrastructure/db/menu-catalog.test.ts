import { describe, expect, it } from "vitest";

import { MENU_PRODUCTS, menuProduct } from "./menu-catalog.js";

describe("service menu", () => {
  it("keeps the restaurant prices in millimes", () => {
    expect(MENU_PRODUCTS).toHaveLength(38);
    expect(new Set(MENU_PRODUCTS.map((product) => product.code)).size).toBe(38);
    expect(menuProduct("brik-thon").priceMillimes).toBe(5_500);
    expect(menuProduct("tabouna").priceMillimes).toBe(2_500);
    expect(menuProduct("flouka-4-pers").priceMillimes).toBe(150_000);
    expect(menuProduct("the-amandes").vatRateBp).toBe(700);
    expect(MENU_PRODUCTS.every((product) => product.priceMillimes > 0)).toBe(true);
  });
});
