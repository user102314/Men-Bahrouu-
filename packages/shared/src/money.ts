declare const millimesBrand: unique symbol;

/** Integer thousandths of a dinar. 1 TND = 1000 millimes. */
export type Millimes = number & { readonly [millimesBrand]: true };

const MILLIMES_PER_TND = 1000n;
const VAT_BASIS_POINTS = 10_000n;

export function assertMillimes(value: number): asserts value is Millimes {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Amount must be a non-negative safe integer number of millimes");
  }
}

export function millimes(value: number): Millimes {
  assertMillimes(value);
  return value;
}

/**
 * Parse a TND amount into millimes.
 * A lone "," or "." is the decimal separator, so "12,500" and "12.5" are both 12.5 TND.
 * When both appear, the last one is the decimal separator and the other is a thousands separator.
 * More than 3 decimal places, negatives, and non-finite values are rejected.
 */
export function tndToMillimes(input: string | number): Millimes {
  const text = typeof input === "number" ? numberToPlainDecimal(input) : input;
  const trimmed = text.replace(/[\s\u00a0\u202f]/g, "").trim();
  if (trimmed.length === 0 || trimmed.startsWith("-")) {
    throw new Error("Amount must be a non-negative TND value");
  }
  const unsigned = trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  const { whole, fraction } = splitTnd(unsigned);
  if (fraction.length > 3) {
    throw new Error("Amount must not have more than 3 decimal places");
  }
  const padded = `${fraction}000`.slice(0, 3);
  const total = BigInt(whole) * MILLIMES_PER_TND + BigInt(padded);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large");
  }
  return millimes(Number(total));
}

/** Convert millimes to a TND number. 12500 millimes → 12.5. */
export function millimesToTnd(value: Millimes): number {
  assertMillimes(value);
  return value / 1000;
}

/** Latin digits in both locales. 12500 → `12,500 TND` or `12,500 د.ت`. */
export function formatMillimes(value: Millimes, locale: "fr" | "ar"): string {
  assertMillimes(value);
  const grouped = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value);
  const suffix = locale === "ar" ? "د.ت" : "TND";
  return `${grouped} ${suffix}`;
}

export function addMillimes(...values: readonly Millimes[]): Millimes {
  let total = 0;
  for (const value of values) {
    assertMillimes(value);
    total += value;
  }
  return millimes(total);
}

export function multiplyMillimes(unit: Millimes, quantity: number): Millimes {
  assertMillimes(unit);
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative integer");
  }
  return millimes(unit * quantity);
}

/**
 * VAT included in a tax-inclusive gross amount.
 * `rateBp` is basis points (700 = 7% = 700/10000). No rate is hardcoded.
 * vat = roundHalfUp(gross * rateBp / (10000 + rateBp)).
 * Half-up, for positive amounts: add half the divisor, then integer-divide,
 * so an exact .5 rounds away from zero.
 */
export function vatPortionFromGross(grossMillimes: Millimes, rateBp: number): Millimes {
  assertMillimes(grossMillimes);
  if (!Number.isSafeInteger(rateBp) || rateBp < 0) {
    throw new Error("VAT rate must be a non-negative integer number of basis points");
  }
  const denominator = VAT_BASIS_POINTS + BigInt(rateBp);
  const numerator = BigInt(grossMillimes) * BigInt(rateBp);
  const vat = (numerator + denominator / 2n) / denominator;
  return millimes(Number(vat));
}

function numberToPlainDecimal(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Amount must be a non-negative finite number");
  }
  const raw = value.toString();
  if (!raw.includes("e") && !raw.includes("E")) {
    return raw;
  }
  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

function splitTnd(value: string): { whole: string; fraction: string } {
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  let decimalIndex = -1;
  let thousands = "";
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      decimalIndex = comma;
      thousands = ".";
    } else {
      decimalIndex = dot;
      thousands = ",";
    }
  } else if (comma >= 0) {
    decimalIndex = comma;
  } else if (dot >= 0) {
    decimalIndex = dot;
  }
  const wholePart = decimalIndex === -1 ? value : value.slice(0, decimalIndex);
  const fraction = decimalIndex === -1 ? "" : value.slice(decimalIndex + 1);
  const whole = (thousands.length === 0 ? wholePart : wholePart.replaceAll(thousands, "")) || "0";
  if (!/^\d+$/.test(whole) || (fraction.length > 0 && !/^\d+$/.test(fraction))) {
    throw new Error("Amount must be a numeric TND value");
  }
  return { whole, fraction };
}
