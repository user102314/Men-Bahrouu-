import { describe, expect, it } from "vitest";

import { visibleNav } from "./nav.js";

describe("visibleNav", () => {
  it("hides catalogue and reports from a cashier", () => {
    const cashier = visibleNav("CASHIER").map((item) => item.to);
    expect(cashier).not.toContain("/admin/products");
    expect(cashier).not.toContain("/admin");
    const admin = visibleNav("ADMIN").map((item) => item.to);
    expect(admin).toContain("/admin");
    expect(admin).toContain("/admin/products");
    expect(admin).toContain("/admin/daily");
    expect(admin).toContain("/admin/staff");
    expect(admin).toContain("/admin/stock");
  });
});
