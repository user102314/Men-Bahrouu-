export const DOMAIN_CODES = [
  "NOT_FOUND",
  "FORBIDDEN",
  "ORDER_ID_CONFLICT",
  "TABLE_BUSY",
  "INVALID_TRANSITION",
  "LINE_ALREADY_SENT",
  "CANCELLATION_EXISTS",
  "PRODUCT_UNAVAILABLE",
  "ALREADY_PAID",
  "SHIFT_REQUIRED",
  "LAST_ADMIN",
  "PRICE_CONFIRMATION",
  "HOST_NOT_PRIVATE",
  "SHIFT_CLOSED",
  "OVERLAP",
  "OPEN_ORDER",
  "EMAIL_TAKEN",
] as const;

export type DomainCode = (typeof DOMAIN_CODES)[number];

const HTTP: Record<DomainCode, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: "Not found" },
  FORBIDDEN: { status: 403, message: "Forbidden" },
  ORDER_ID_CONFLICT: { status: 409, message: "Order id already used" },
  TABLE_BUSY: { status: 409, message: "Table already has an open order" },
  INVALID_TRANSITION: { status: 409, message: "Invalid status transition" },
  LINE_ALREADY_SENT: { status: 409, message: "Sent line cannot be changed" },
  CANCELLATION_EXISTS: { status: 409, message: "A pending cancellation already exists" },
  PRODUCT_UNAVAILABLE: { status: 422, message: "Product unavailable" },
  ALREADY_PAID: { status: 409, message: "Order is already paid" },
  SHIFT_REQUIRED: { status: 409, message: "An open cash shift is required" },
  LAST_ADMIN: { status: 409, message: "The last active admin cannot be removed" },
  PRICE_CONFIRMATION: { status: 409, message: "Price is above the ceiling and needs confirmation" },
  HOST_NOT_PRIVATE: { status: 422, message: "Printer host must be a private address" },
  SHIFT_CLOSED: { status: 409, message: "Closed shift cannot be changed" },
  OVERLAP: { status: 409, message: "Shifts overlap" },
  OPEN_ORDER: { status: 409, message: "Table has an open order" },
  EMAIL_TAKEN: { status: 409, message: "Email is already used" },
};

export function domainHttp(code: DomainCode): { status: number; message: string } {
  return HTTP[code];
}

export class DomainError extends Error {
  constructor(readonly code: DomainCode) {
    super(code);
    this.name = "DomainError";
  }
}
