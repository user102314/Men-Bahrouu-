import {
  addMillimes,
  millimes,
  multiplyMillimes,
  type Millimes,
  type OrderItemStatus,
} from "@resto/shared";

export function activeTotal(
  lines: readonly { status: OrderItemStatus; unitPriceMillimes: number; quantity: number }[],
): Millimes {
  return addMillimes(
    ...lines
      .filter((line) => line.status === "ACTIVE")
      .map((line) => multiplyMillimes(millimes(line.unitPriceMillimes), line.quantity)),
  );
}
