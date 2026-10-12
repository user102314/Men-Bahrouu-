import type { FloorTable } from "./hub.js";

export const TABLE_COUNT = 100;
export const PAGE_SIZE = 25;

export function tableByNumber(tables: FloorTable[], number: number): FloorTable | null {
  const match = tables.find((table) => table.label === String(number));
  if (!match || match.isActive === false) {
    return null;
  }
  return match;
}

export function nextTableNumber(tables: FloorTable[]): number {
  const used = new Set(tables.map((table) => table.label));
  let number = 1;
  while (used.has(String(number))) {
    number += 1;
  }
  return number;
}

export function zoneForNumber(number: number): string {
  const start = Math.floor((number - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
  return `${start}-${start + PAGE_SIZE - 1}`;
}

export function pageStartFor(number: number): number {
  return Math.floor((number - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
}

export function pageStarts(tables: FloorTable[]): number[] {
  const numbers = tables
    .map((table) => Number(table.label))
    .filter((number) => Number.isInteger(number) && number > 0);
  const max = Math.max(TABLE_COUNT, ...numbers);
  const starts: number[] = [];
  for (let start = 1; start <= max; start += PAGE_SIZE) {
    starts.push(start);
  }
  return starts;
}

export function highestTableNumber(tables: FloorTable[]): number {
  const numbers = tables
    .map((table) => Number(table.label))
    .filter((number) => Number.isInteger(number) && number > 0);
  return Math.max(TABLE_COUNT, ...numbers);
}

export type { FloorTable };
