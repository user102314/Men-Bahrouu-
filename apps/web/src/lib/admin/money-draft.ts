import { tndToMillimes } from "@resto/shared";

export interface MoneyDraft {
  millimes: number | null;
  error: "empty" | "invalid" | "thousands" | null;
  hint: boolean;
  needsConfirm: boolean;
}

const THOUSANDS = /[.,]\d{3}$/;

/** A single comma or dot is the decimal separator. Both together are refused. */
export function parseMoneyDraft(raw: string, ceilingMillimes = 1_000_000): MoneyDraft {
  const text = raw.trim();
  if (text.length === 0) {
    return { millimes: null, error: "empty", hint: false, needsConfirm: false };
  }
  if (text.includes(",") && text.includes(".")) {
    return { millimes: null, error: "thousands", hint: false, needsConfirm: false };
  }
  const hint = THOUSANDS.test(text);
  try {
    const millimes = tndToMillimes(text);
    return {
      millimes,
      error: null,
      hint,
      needsConfirm: millimes >= ceilingMillimes,
    };
  } catch {
    return { millimes: null, error: "invalid", hint: false, needsConfirm: false };
  }
}
