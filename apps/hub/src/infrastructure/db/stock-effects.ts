import { newId, weightedAverageCostPer1000 } from "@resto/shared";
import type postgres from "postgres";

type Tx = postgres.TransactionSql<Record<string, never>>;

interface Actor {
  id: string;
  deviceId: string | null;
}

export interface StockAlert {
  name: "stock.low";
  serverId: string;
  payload: {
    stockItemId: string;
    code: string;
    quantityBase: number;
    minThresholdBase: number;
  };
}

interface ConsumptionLine {
  productId: string;
  quantity: number;
}

export async function consumeRecipes(
  tx: Tx,
  siteId: string,
  actor: Actor,
  lines: readonly ConsumptionLine[],
  refType: string,
  refId: string,
  reason: "SALE" | "CORRECTION",
  sign: 1 | -1,
): Promise<StockAlert[]> {
  const alerts: StockAlert[] = [];
  for (const line of lines) {
    const recipe = await tx<
      { stock_item_id: string; quantity_base: number; on_hand: number; min_threshold_base: number; code: string; cost: number }[]
    >`
      select i.stock_item_id, i.quantity_base, s.quantity_base as on_hand,
             s.min_threshold_base, s.code, s.avg_cost_millimes_per_1000_base as cost
      from product_ingredients i
      join stock_items s on s.id = i.stock_item_id
      where i.product_id = ${line.productId} and s.site_id = ${siteId}
      for update of s
    `;
    for (const ingredient of recipe) {
      const delta = sign * ingredient.quantity_base * line.quantity;
      if (delta === 0) {
        continue;
      }
      const next = ingredient.on_hand + delta;
      await tx`
        update stock_items set quantity_base = ${next} where id = ${ingredient.stock_item_id}
      `;
      await tx`
        insert into stock_movements (
          id, site_id, stock_item_id, delta_base, reason, ref_type, ref_id, unit_cost, created_by
        ) values (
          ${newId()}, ${siteId}, ${ingredient.stock_item_id}, ${delta}, ${reason}::stock_movement_reason,
          ${refType}, ${refId}, ${ingredient.cost}, ${actor.id}
        )
      `;
      if (sign < 0 && ingredient.on_hand > ingredient.min_threshold_base && next <= ingredient.min_threshold_base) {
        alerts.push({
          name: "stock.low",
          serverId: "",
          payload: {
            stockItemId: ingredient.stock_item_id,
            code: ingredient.code,
            quantityBase: next,
            minThresholdBase: ingredient.min_threshold_base,
          },
        });
      }
    }
  }
  return alerts;
}

export async function restockOnVoidEnabled(tx: Tx, siteId: string): Promise<boolean> {
  const rows = await tx<{ value: boolean }[]>`
    select value from settings where site_id = ${siteId} and key = 'restockOnVoid'
  `;
  return rows[0]?.value === true;
}

export async function receivePurchaseCost(
  currentQuantityBase: number,
  currentCostPer1000: number,
  incomingQuantityBase: number,
  incomingTotalCostMillimes: number,
): Promise<number> {
  return weightedAverageCostPer1000({
    currentQuantityBase,
    currentCostPer1000,
    incomingQuantityBase,
    incomingTotalCostMillimes,
  });
}

export function isPrivatePrinterHost(host: string): boolean {
  const value = host.trim().toLowerCase();
  if (value === "localhost") {
    return true;
  }
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const a = numbers[0] ?? 0;
  const b = numbers[1] ?? 0;
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
