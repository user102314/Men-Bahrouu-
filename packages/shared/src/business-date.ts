/**
 * Business date in a timezone after subtracting a cutoff duration.
 * A service that ends at 01:00 still belongs to the previous day when the cutoff is 5.
 * The cutoff is an absolute duration, so a daylight-saving gap or overlap can move the boundary
 * by one hour compared with the wall clock.
 */
export function businessDate(now: Date, cutoffHour: number, timeZone = "Africa/Tunis"): string {
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new Error("Cutoff hour must be an integer from 0 to 23");
  }
  const shifted = new Date(now.getTime() - cutoffHour * 60 * 60 * 1000);
  return formatDateInTimeZone(shifted, timeZone);
}

export function formatDateInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = part(parts, "year");
  const month = part(parts, "month");
  const day = part(parts, "day");
  return `${year}-${month}-${day}`;
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  const value = parts.find((item) => item.type === type)?.value;
  if (!value) {
    throw new Error(`Missing ${type} in formatted date`);
  }
  return value;
}
