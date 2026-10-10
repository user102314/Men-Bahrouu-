# Reports

Every report is a management report. It is not a fiscal ticket, not a NACEF document, and not a tax return. Each JSON response includes `notice`: « Rapport de gestion, pas un document fiscal ».

## Period

`from` and `to` are inclusive business dates (`YYYY-MM-DD`), not raw UTC timestamps.

The business date subtracts `businessDayCutoffHour` (default 5, overridable in `settings`) as an absolute duration, then reads the calendar date in `Africa/Tunis`. A sale at 00:30 Tunis belongs to the previous business day. Sales reports filter `orders.business_date`. Hours inside a day use `Africa/Tunis` wall time.

The dashboard also returns the previous window of the same length, ending the day before `from`.

## Indicators

All amounts are integer millimes. Averages use half-up rounding of the millime integer (`Math.round`).

| Route | Formula |
| --- | --- |
| `GET /reports/dashboard` | Revenue = sum of `payments.amount_millimes` whose order business date is in range. Order count = number of those payments. Average basket = revenue / order count, or 0. Voids = `VOIDED` lines, count and `quantity * unit_price_millimes`. Covers are `null` until a cover count exists. Stock alerts = active items with `quantity_base <= min_threshold_base`. Cash variances = closed shifts in the Tunis date range whose variance is not zero. |
| `GET /reports/sales/by-hour` | Sum of payments grouped by the Tunis hour of `payments.created_at`, still limited to the business-date range. |
| `GET /reports/sales/by-day` | Sum of payments grouped by `orders.business_date`. |
| `GET /reports/products/top` | Active lines of `PAID` orders: quantity and revenue. Optional `stationKind` is `BAR` or `KITCHEN`. |
| `GET /reports/payments` | Sum and count by `CASH`, `CARD`, or `MEAL_VOUCHER`. |
| `GET /reports/stations` | Active paid lines grouped by station kind. |
| `GET /reports/servers` | Orders, payment revenue, and voided lines per `server_id`. |
| `GET /reports/voids` | Approved cancellation requests in the business-date range: requester, decider, admin override, reason. |
| `GET /reports/daily-close` | Payment totals by method, void totals, and VAT. VAT is the sum of `vatPortionFromGross(lineGross, product.vat_rate_bp)` on active paid lines. That is `halfUp(gross * rateBp / (10000 + rateBp))`, the VAT included in a gross price. |
| `GET /reports/stock-valuation` | Sum of `lineCostMillimes(quantity, average cost)` over active stock items. Negative quantities contribute a negative value. |
| `GET /reports/food-cost` | Per active product, recipe cost is the sum of `lineCostMillimes` of each ingredient. Margin = price − that cost. Products without a recipe have a cost of 0. |
| `GET /reports/staff-hours` | Closed punches grouped by user. Minutes are `clock_out - clock_in`, dated on the Tunis clock-in day. |

## Cash drawer

For a shift:

```
expected = opening float + cash payments attached to the shift + PAY_IN − PAY_OUT
variance = counted − expected
```

The cash figure is the payment amount, not the tendered amount, because change is handed back. A variance whose absolute value is above `cashVarianceAlertMillimes` (default 0, so any non-zero variance) writes an audit row and rides on `shift.closed`.

## CSV

`?format=csv` returns UTF-8 with a BOM, `;` as the separator, and millime amounts as TND with three decimals and a comma (`28000` millimes → `28,000`). Dates already stored as business dates are `YYYY-MM-DD`.
