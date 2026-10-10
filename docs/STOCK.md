# Stock

Quantities are integers in the base unit. Money is integer millimes. Nothing in this module is a fiscal document.

## Base units

| Unit | Meaning | Display conversion |
| --- | --- | --- |
| `G` | gram | kilograms accept 3 decimals at entry (`1,5` kg = 1500 g) |
| `ML` | millilitre | litres accept 3 decimals (`0,25` L = 250 mL) |
| `PIECE` | piece | integers only |

`toBaseQuantity` and `formatBaseQuantity` in `packages/shared/src/stock.ts` do the conversion. The database never stores kilograms or litres.

## Weighted average

`avg_cost_millimes_per_1000_base` is the cost of 1 000 base units, in millimes, rounded half-up.

```
value = quantityBase * costPer1000 / 1000
newCost = halfUp((oldQty * oldCost + incomingCostMillimes * 1000) / newQty)
```

When the quantity on hand is zero or negative, the incoming price replaces the average. Negative stock is an alert, not a cost base.

Worked example: 2 000 g at 4 000 millimes per 1 000 g, then 1 000 g bought for 5 000 millimes.

```
value = 2 000 * 4 000 / 1 000 + 5 000 = 13 000 millimes
newCost = halfUp(13 000 * 1 000 / 3 000) = 4 333
```

`lineCostMillimes(quantity, costPer1000)` is the same half-up division. A recipe line of 1 500 g at 4 000 millimes per 1 000 g costs 6 000 millimes.

## Sale consumption

Sending an order, in the same transaction as the tickets and the audit row, writes one `SALE` movement per recipe ingredient:

```
delta = -(recipeQuantityBase * lineQuantity)
```

A product with no recipe writes nothing and raises no error. A shortage does not block the send. The quantity may become negative. `stock.low` is published to the admin room only when the quantity crosses from above the threshold to at or below it. A later sale that stays under the threshold does not repeat the event.

## Voids

An approved void of a sent line does not put the ingredient back. The dish is assumed prepared. Real loss is a `WASTE` movement with a note. If the setting `restockOnVoid` is `true`, the void writes a positive `CORRECTION` for the same recipe quantity.

## Purchases

A draft can be edited. Receive, in one transaction, writes a `PURCHASE` movement per line, recomputes the average, stores the server-side total, and sets `RECEIVED`. A received purchase cannot be edited. Cancel writes `PURCHASE_CANCEL` movements for the opposite quantity and removes that receipt from the average when quantity remains.

## Inventory

A count compares `countedBase` with the locked on-hand quantity. The difference is an `INVENTORY` movement. `diffValueMillimes` uses the average cost and the same half-up rule, and it is negative when the count is short.

## Append-only ledger

`stock_movements` rejects `UPDATE` and `DELETE` with the same style of trigger as `audit_log`. `TRUNCATE` is reserved for the development reset.
