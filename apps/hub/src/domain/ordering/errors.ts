export const DOMAIN_CODES = [
  "NOT_FOUND",
  "FORBIDDEN",
  "ORDER_ID_CONFLICT",
  "TABLE_BUSY",
  "INVALID_TRANSITION",
  "LINE_ALREADY_SENT",
  "CANCELLATION_EXISTS",
  "PRODUCT_UNAVAILABLE",
] as const;

export type DomainCode = (typeof DOMAIN_CODES)[number];

export class DomainError extends Error {
  constructor(readonly code: DomainCode) {
    super(code);
    this.name = "DomainError";
  }
}
