import { millimes, type Millimes } from "@resto/shared";

export const CASH_SHORTCUTS_MILLIMES = [5_000, 10_000, 20_000, 50_000] as const;

export function asMillimes(value: number): Millimes {
  return millimes(value);
}

/** Change handed back. Negative when the tendered amount does not cover the total. */
export function changeDue(totalMillimes: number, tenderedMillimes: number): number {
  return tenderedMillimes - totalMillimes;
}
