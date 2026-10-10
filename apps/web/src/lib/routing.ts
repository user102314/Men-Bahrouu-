export type StationKind = "BAR" | "KITCHEN";

export interface RoutableLine {
  quantity: number;
  stationKind: StationKind;
  sent: boolean;
}

/** Counts only lines that the next send will print. */
export function routingPreview(lines: readonly RoutableLine[]): { bar: number; kitchen: number } {
  const pending = lines.filter((line) => !line.sent);
  return {
    bar: pending
      .filter((line) => line.stationKind === "BAR")
      .reduce((sum, line) => sum + line.quantity, 0),
    kitchen: pending
      .filter((line) => line.stationKind === "KITCHEN")
      .reduce((sum, line) => sum + line.quantity, 0),
  };
}
