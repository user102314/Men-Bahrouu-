import { can, type OrderItemStatus, type OrderStatus, type Role } from "@resto/shared";

import { DomainError } from "./errors.js";

const OPENABLE: readonly OrderStatus[] = ["DRAFT", "SENT", "SERVED"];

export function assertCanViewOrder(role: Role, serverId: string, actorId: string): void {
  if (can(role, "order.view.all")) {
    return;
  }
  if (can(role, "order.view.own") && serverId === actorId) {
    return;
  }
  throw new DomainError("NOT_FOUND");
}

export function assertCanEditUnsent(
  serverId: string,
  actorId: string,
  sentAt: string | null,
): void {
  if (serverId !== actorId) {
    throw new DomainError("FORBIDDEN");
  }
  if (sentAt !== null) {
    throw new DomainError("LINE_ALREADY_SENT");
  }
}

/** First send, a later addition, or an idempotent repeat when nothing is left to send. */
export function statusAfterSend(
  status: OrderStatus,
  unsentActive: number,
): OrderStatus | "UNCHANGED" {
  if (unsentActive === 0) {
    if (status === "SENT" || status === "SERVED") {
      return "UNCHANGED";
    }
    throw new DomainError("INVALID_TRANSITION");
  }
  if (status === "DRAFT" || status === "SENT" || status === "SERVED") {
    return "SENT";
  }
  throw new DomainError("INVALID_TRANSITION");
}

export function statusAfterServed(status: OrderStatus): OrderStatus {
  if (status !== "SENT") {
    throw new DomainError("INVALID_TRANSITION");
  }
  return "SERVED";
}

export function assertCanAddItems(status: OrderStatus): void {
  if (!OPENABLE.includes(status)) {
    throw new DomainError("INVALID_TRANSITION");
  }
}

export function statusAfterActiveCount(status: OrderStatus, activeCount: number): OrderStatus {
  if (status === "PAID") {
    throw new DomainError("INVALID_TRANSITION");
  }
  if (activeCount > 0 || status === "CANCELLED") {
    return status;
  }
  if (status === "DRAFT" || status === "SENT" || status === "SERVED") {
    return "CANCELLED";
  }
  throw new DomainError("INVALID_TRANSITION");
}

export function isOpenStatus(status: OrderStatus): boolean {
  return OPENABLE.includes(status);
}

export function isVoided(status: OrderItemStatus): boolean {
  return status === "VOIDED";
}
