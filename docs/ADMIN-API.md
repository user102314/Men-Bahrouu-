# Admin API

Management routes on the hub. Every route checks a permission on the server. Amounts are integer millimes. Stock quantities are integers in the base unit. Errors use `{ error: { code, message, details? }, requestId }`.

These responses are internal records. A payment response includes `notice`: « enregistrement de gestion, non fiscal ». Reports include `notice`: « Rapport de gestion, pas un document fiscal ».

Authorization header: `Bearer` token. Floor routes also need the device that was used at login.

## Shared error codes

| Code | HTTP | When |
| --- | --- | --- |
| `FORBIDDEN` | 403 | Missing permission, or an admin deactivating themselves |
| `VALIDATION_ERROR` | 400 | Body or query rejected by Zod |
| `NOT_FOUND` | 404 | Id missing, or it belongs to another site |
| `PRICE_CONFIRMATION` | 409 | Price ≥ `priceCeilingMillimes` (default 1 000 000, i.e. 1 000 TND) without `confirmHighPrice: true` |
| `LAST_ADMIN` | 409 | Demoting the last active admin |
| `HOST_NOT_PRIVATE` | 422 | Printer host is not localhost or a private IPv4 address |
| `OPEN_ORDER` | 409 | Deactivating a table that still has a DRAFT, SENT, or SERVED order |
| `OVERLAP` | 409 | Second open punch, or two staff slots that overlap |
| `SHIFT_REQUIRED` | 409 | `requireOpenShift` is true and the device has no open shift |
| `SHIFT_CLOSED` | 409 | Movement or recount on a closed shift |
| `ALREADY_PAID` | 409 | Second payment for the same order |
| `INVALID_TRANSITION` | 409 | Draft-only edit, payment of an unsent order, cash tendered below the total |

## Catalogue, tables, printers, settings

| Method and path | Permission |
| --- | --- |
| `POST /categories` | `catalog.edit` |
| `PATCH /categories/:id` | `catalog.edit` |
| `POST /categories/reorder` | `catalog.edit` |
| `POST /products` | `catalog.edit` |
| `PATCH /products/:id` | `catalog.edit` |
| `POST /products/reorder` | `catalog.edit` |
| `PATCH /products/:id/availability` | `catalog.availability` |
| `GET /admin/products` | `catalog.edit` |
| `GET /admin/categories` | `catalog.edit` |
| `GET /admin/stations` | `printer.manage` |
| `GET /admin/printers` | `printer.manage` |
| `GET /products/:id/ingredients` | `stock.manage` |
| `POST /tables` | `settings.edit` or `shift.manage` |
| `PATCH /tables/:id` | `settings.edit` |
| `POST /tables/zones` | `settings.edit` |
| `POST /printers` | `printer.manage` |
| `PATCH /printers/:id` | `printer.manage` |
| `PATCH /stations/:id` | `printer.manage` |
| `GET /settings` | `settings.edit` |
| `PUT /settings` | `settings.edit` |
| `GET /daily-specials` | `order.view.own` |
| `PUT /daily-specials` | `catalog.edit` |

`POST /categories` body: `{ "id", "nameFr", "nameAr", "stationId" }`. Response `201` echoes the category. Changing a category's station does not rewrite `order_items.station_id`.

`PATCH /categories/:id` may set `isActive`. There is no delete. `GET /admin/categories` returns every category, including inactive ones, with `station_id`, `station_kind`, `is_active`, and `sort_order`.

`GET /admin/stations` returns `id`, `kind`, `name`, `printer_id`, `fallback_station_id`. `GET /admin/printers` returns `id`, `name`, `host`, `port`, `paper_width_mm`, `is_active`. `GET /printers/status` stays the live probe.

`GET /products/:id/ingredients` returns `{ ingredients: [{ stock_item_id, quantity_base }] }`. `PUT /products/:id/ingredients` still replaces the recipe.

`PATCH /products/:id` body may include `priceMillimes`, `isActive`, `confirmHighPrice`. There is no delete. `isActive: false` hides the product from sale setup; `isAvailable` is the 86 (épuisé) flag.

`GET /tables` adds `isActive`. `GET /devices` adds `lastSeenAt` (ISO time or null).

`PATCH /products/:id/availability` body: `{ "isAvailable": false }`. Publishes `catalog.updated`.

`POST /tables/zones` body: `{ "from": "Salle", "to": "Terrasse" }`.

`POST /printers` body: `{ "id", "name", "host": "192.168.1.20", "port": 9100 }`.

`GET /daily-specials` returns `{ businessDate, productIds }` for the current business date in `Africa/Tunis`. A list saved on another date comes back empty. `PUT /daily-specials` body is `{ productIds }` (at most 40 active products). The hub stamps today's business date, audits `settings.updated`, and drops the settings cache.

`PUT /settings` accepts any non-empty subset of `restaurant` (`name`, `address`, `phone`), `defaultVatBp`, `businessDayCutoffHour`, `printColumns`, `ticketHeader`, `requireOpenShift` (default false), `restockOnVoid` (default false), `cashVarianceAlertMillimes` (default 0), `priceCeilingMillimes`. The cache is dropped and `settings.updated` is published. Example:

```json
{ "requireOpenShift": true, "restockOnVoid": false }
```

## Staff and attendance

| Method and path | Permission |
| --- | --- |
| `GET /users` | `staff.manage` |
| `POST /users` | `staff.manage` |
| `PATCH /users/:id` | `staff.manage` |
| `POST /users/:id/reset-pin` | `staff.manage` |
| `POST /users/:id/deactivate` | `staff.manage` |
| `POST /users/:id/reactivate` | `staff.manage` |
| `PATCH /users/:id/role` | `staff.manage` |
| `POST /attendance/clock-in` | `attendance.self` |
| `POST /attendance/clock-out` | `attendance.self` |
| `GET /attendance?from&to&userId` | authenticated; a non-admin sees only themselves |
| `PATCH /attendance/:id` | `attendance.manage` |
| `GET /staff-shifts?week=` | `staff.manage` |
| `PUT /staff-shifts` | `staff.manage` |

`POST /users` for an admin requires `email` and `password`. A floor role receives a 4-digit PIN once in `{ "id", "pin" }`. Responses never contain a hash.

`POST /users/:id/reset-pin` returns `{ "pin": "4821" }` once, clears `failed_attempts` and `locked_until`, and refuses an admin account.

`PATCH /attendance/:id` requires `reason` (at least 3 characters). Example: `{ "clockOut": "2026-10-10T18:00:00.000Z", "reason": "Oubli de sortie" }`.

`PUT /staff-shifts` replaces the week: `{ "weekStart": "2026-10-05", "slots": [{ "userId", "workDate", "startTime": "11:00", "endTime": "15:00" }] }`.

## Stock, purchases, inventory

| Method and path | Permission |
| --- | --- |
| `GET /stock-items` | `stock.manage` |
| `POST /stock-items` | `stock.manage` |
| `PATCH /stock-items/:id` | `stock.manage` |
| `GET /stock-items/:id/movements` | `stock.manage` |
| `PUT /products/:id/ingredients` | `stock.manage` |
| `POST /stock-movements` | `stock.manage` |
| `GET /stock/alerts` | `stock.manage` |
| `POST /stock/inventories` | `inventory.manage` |
| `GET /suppliers` | `purchase.manage` |
| `POST /suppliers` | `purchase.manage` |
| `PATCH /suppliers/:id` | `purchase.manage` |
| `POST /purchases` | `purchase.manage` |
| `PATCH /purchases/:id` | `purchase.manage` |
| `POST /purchases/:id/receive` | `purchase.manage` |
| `POST /purchases/:id/cancel` | `purchase.manage` |
| `POST /purchases/:id/mark-paid` | `purchase.manage` |

`POST /stock-items` body: `{ "id", "code": "SEM", "nameFr": "Semoule", "baseUnit": "G", "minThresholdBase": 2000 }`.

`PUT /products/:id/ingredients` replaces the recipe: `{ "ingredients": [{ "stockItemId", "quantityBase": 80 }] }`.

`POST /stock-movements` is only `WASTE` or `CORRECTION`, and `note` is required: `{ "stockItemId", "deltaBase": -10, "reason": "WASTE", "note": "Bouteille cassée" }`.

`POST /purchases` body: `{ "id", "supplierId", "purchaseDate": "2026-10-01", "lines": [{ "stockItemId", "quantityBase": 2000, "totalCostMillimes": 8000 }] }`. Receive returns `{ "id", "status": "RECEIVED", "totalMillimes" }`.

`POST /stock/inventories` body: `{ "lines": [{ "stockItemId", "countedBase": 1500 }] }`. Response lines include `diffBase` and `diffValueMillimes`.

## Cash and expenses

| Method and path | Permission |
| --- | --- |
| `POST /cash-shifts/open` | `shift.manage` |
| `POST /cash-shifts/:id/cash-movements` | `shift.manage` |
| `POST /cash-shifts/:id/close` | `shift.manage` |
| `PATCH /cash-shifts/:id` | authenticated admin, closed shift only |
| `GET /cash-shifts/current` | `shift.manage` |
| `GET /service-recette` | `shift.manage` |
| `POST /service-recette/open` | `shift.manage` |
| `POST /service-recette/close` | `shift.manage` |
| `GET /cash-shifts?from&to&status` | `shift.manage` or `report.view` |
| `POST /orders/:id/payments` | `payment.create` |
| `POST /expenses` | `expense.manage` |
| `PATCH /expenses/:id` | `expense.manage` |
| `GET /expenses?from&to&category` | `expense.manage` |

Open: `{ "id", "openingFloatMillimes": 10000 }`. One `OPEN` shift per device. Publishes `shift.opened`.

Movement: `{ "type": "PAY_OUT", "amountMillimes": 300, "reason": "Achat de glace" }`.

Close: `{ "countedMillimes": 12000 }` returns `{ "expectedMillimes", "varianceMillimes" }` and publishes `shift.closed`.

`POST /service-recette/open` starts the morning recette for the cashier on the floor. `POST /service-recette/close` ends it and returns paid product lines since the opening, with `totals.all`, `totals.bar`, and `totals.kitchen`. The `notice` is `Rapport de gestion, pas un document fiscal`. A second open while one is open returns `409`.

Payment: `{ "method": "CASH", "tenderedMillimes": 3000 }` or `{ "method": "CARD" }`. The order must be `SENT` or `SERVED`, with every active line already sent. The amount is the order total computed by the hub. The row stores `payments.shift_id` when the cashier device has an open shift. Response `201`: `{ "notice": "enregistrement de gestion, non fiscal", "payment" }`. Publishes `order.paid` and `table.updated`. A second payment returns `ALREADY_PAID`.

`POST /orders/:id/request-bill` — permission `order.markServed`. If the order is on a table, the table becomes `TO_PAY` and `table.updated` is published. A paid or cancelled order returns `INVALID_TRANSITION`.

Expense: `{ "id", "category": "SUPPLIES", "amountMillimes": 45000, "expenseDate": "2026-10-03", "payFromShiftId" }`. `payFromShiftId` also writes a `PAY_OUT`. Void with `{ "isVoid": true }`. Rows are not deleted.

## Reports and audit

Permission `report.view` except audit, which is `audit.view`.

| Path |
| --- |
| `GET /reports/dashboard` |
| `GET /reports/sales/by-hour` |
| `GET /reports/sales/by-day` |
| `GET /reports/products/top` |
| `GET /reports/payments` |
| `GET /reports/stations` |
| `GET /reports/servers` |
| `GET /reports/voids` |
| `GET /reports/daily-close` |
| `GET /reports/stock-valuation` |
| `GET /reports/food-cost` |
| `GET /reports/staff-hours` |

Query: `from`, `to` (`YYYY-MM-DD`), optional `format=csv`, and `stationKind` on the product report. Formulas are in `docs/REPORTS.md`.

`GET /audit?actor&action&entityType&from&to&cursor&override=true&limit` returns `{ entries, nextCursor }`. `adminOverride` is true when `after.overrideBy` is set. `override=true` keeps only those rows. Pages are ordered by time descending; pass `nextCursor` as `cursor`.

## Realtime

| Event | Room |
| --- | --- |
| `catalog.updated` | cashier and admin |
| `shift.opened`, `shift.closed` | cashier and admin |
| `stock.low` | admin |
| `settings.updated` | admin |
| `order.paid` | the server, cashier, and admin |

The dashboard can refresh on `order.paid`, `stock.low`, and `shift.closed`.
