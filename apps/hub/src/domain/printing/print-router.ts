export interface StationLine {
  stationId: string;
}

export interface TicketGroup<T extends StationLine> {
  stationId: string;
  lines: T[];
}

/** One ticket draft per station that has at least one line. Stations with no lines are omitted. */
export function routeByStation<T extends StationLine>(lines: readonly T[]): TicketGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const existing = groups.get(line.stationId);
    if (existing) {
      existing.push(line);
    } else {
      groups.set(line.stationId, [line]);
    }
  }
  return [...groups.entries()].map(([stationId, grouped]) => ({ stationId, lines: grouped }));
}
