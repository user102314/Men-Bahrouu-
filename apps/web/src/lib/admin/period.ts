import { businessDate } from "@resto/shared";

export type PeriodPreset = "today" | "yesterday" | "7" | "30" | "month" | "custom";

export interface DateRange {
  from: string;
  to: string;
}

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Invalid business date");
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function presetRange(
  preset: Exclude<PeriodPreset, "custom">,
  now: Date,
  cutoffHour: number,
): DateRange {
  const today = businessDate(now, cutoffHour);
  if (preset === "today") {
    return { from: today, to: today };
  }
  if (preset === "yesterday") {
    const day = addIsoDays(today, -1);
    return { from: day, to: day };
  }
  if (preset === "7") {
    return { from: addIsoDays(today, -6), to: today };
  }
  if (preset === "30") {
    return { from: addIsoDays(today, -29), to: today };
  }
  return { from: `${today.slice(0, 8)}01`, to: today };
}
