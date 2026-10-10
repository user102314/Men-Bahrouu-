import { describe, expect, it } from "vitest";

import { routeByStation } from "./print-router.js";

describe("routeByStation", () => {
  it("splits a drink and a dish and skips an empty station", () => {
    const groups = routeByStation([
      { stationId: "bar", name: "Café" },
      { stationId: "kitchen", name: "Couscous" },
      { stationId: "bar", name: "Thé" },
    ]);
    expect(groups).toEqual([
      {
        stationId: "bar",
        lines: [
          { stationId: "bar", name: "Café" },
          { stationId: "bar", name: "Thé" },
        ],
      },
      { stationId: "kitchen", lines: [{ stationId: "kitchen", name: "Couscous" }] },
    ]);
    expect(routeByStation([])).toEqual([]);
    expect(routeByStation([{ stationId: "bar", name: "Café" }])).toHaveLength(1);
  });
});
