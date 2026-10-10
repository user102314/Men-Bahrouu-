import { describe, expect, it } from "vitest";

import { parseMoneyDraft } from "./money-draft.js";

describe("parseMoneyDraft", () => {
  it("reads 1,500 as 1.5 TND and refuses a thousands separator", () => {
    const hinted = parseMoneyDraft("1,500");
    expect(hinted.millimes).toBe(1_500);
    expect(hinted.hint).toBe(true);
    expect(hinted.needsConfirm).toBe(false);
    expect(parseMoneyDraft("12.5").millimes).toBe(12_500);
    expect(parseMoneyDraft("1,500.00").error).toBe("thousands");
    expect(parseMoneyDraft("1500").needsConfirm).toBe(true);
    expect(parseMoneyDraft("").error).toBe("empty");
  });
});
