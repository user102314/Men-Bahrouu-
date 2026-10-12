export type StationFilter = "ALL" | "BAR" | "KITCHEN";

export type AnalysisLine = {
  productId: string;
  name: string;
  kind: "BAR" | "KITCHEN";
  soldQuantity: number;
  revenueMillimes: number;
  voidedQuantity: number;
  voidedMillimes: number;
  unitCostMillimes: number | null;
};

export type AnalysisRow = AnalysisLine & {
  marginMillimes: number | null;
  revenueShareBp: number;
  voidRateBp: number;
  marginShareBp: number | null;
};

export type AnalysisView = {
  rows: AnalysisRow[];
  topBar: AnalysisLine | null;
  topKitchen: AnalysisLine | null;
  voidRateBp: number;
  knownMarginMillimes: number;
  missingRecipeCount: number;
};

/** Integer basis points: 10_000 = 100 %. */
export function shareBasisPoints(part: number, whole: number): number {
  if (whole === 0) {
    return 0;
  }
  return Math.round((part * 10_000) / whole);
}

export function formatBasisPoints(basisPoints: number): string {
  const tenths = Math.round(basisPoints / 10);
  const sign = tenths < 0 ? "-" : "";
  const absolute = Math.abs(tenths);
  const whole = Math.trunc(absolute / 10);
  const fraction = absolute % 10;
  return `${sign}${whole},${fraction} %`;
}

export function analyzeProducts(
  lines: readonly AnalysisLine[],
  filter: StationFilter,
): AnalysisView {
  const picked = filter === "ALL" ? [...lines] : lines.filter((line) => line.kind === filter);
  const revenueTotal = picked.reduce((sum, line) => sum + line.revenueMillimes, 0);
  const valued = picked.map((line) => ({
    ...line,
    marginMillimes:
      line.unitCostMillimes === null
        ? null
        : line.revenueMillimes - line.unitCostMillimes * line.soldQuantity,
  }));
  const knownMarginMillimes = valued.reduce((sum, line) => sum + (line.marginMillimes ?? 0), 0);
  const rows = valued
    .map((line) => ({
      ...line,
      revenueShareBp: shareBasisPoints(line.revenueMillimes, revenueTotal),
      voidRateBp: shareBasisPoints(line.voidedQuantity, line.soldQuantity + line.voidedQuantity),
      marginShareBp:
        line.marginMillimes === null || knownMarginMillimes <= 0
          ? null
          : shareBasisPoints(line.marginMillimes, knownMarginMillimes),
    }))
    .sort(
      (left, right) =>
        right.revenueMillimes - left.revenueMillimes ||
        right.soldQuantity - left.soldQuantity ||
        left.name.localeCompare(right.name, "fr"),
    );
  const voidedQuantity = picked.reduce((sum, line) => sum + line.voidedQuantity, 0);
  const movedQuantity = picked.reduce(
    (sum, line) => sum + line.soldQuantity + line.voidedQuantity,
    0,
  );
  return {
    rows,
    topBar: filter === "KITCHEN" ? null : leader(lines, "BAR"),
    topKitchen: filter === "BAR" ? null : leader(lines, "KITCHEN"),
    voidRateBp: shareBasisPoints(voidedQuantity, movedQuantity),
    knownMarginMillimes,
    missingRecipeCount: picked.filter((line) => line.unitCostMillimes === null).length,
  };
}

function leader(lines: readonly AnalysisLine[], kind: "BAR" | "KITCHEN"): AnalysisLine | null {
  let best: AnalysisLine | null = null;
  for (const line of lines) {
    if (line.kind !== kind) {
      continue;
    }
    if (
      !best ||
      line.soldQuantity > best.soldQuantity ||
      (line.soldQuantity === best.soldQuantity && line.revenueMillimes > best.revenueMillimes)
    ) {
      best = line;
    }
  }
  return best;
}
