# Agent rules

Local hub for one Tunisian restaurant. This is not a certified fiscal cash register (NACEF). It manages orders, bar/kitchen printing, stock, staff, and internal finance. Payments are internal records only. Never present a slip as a fiscal ticket. Printed slips are preparation tickets (bar / kitchen).

Interface languages: French and Arabic (RTL). Timezone: `Africa/Tunis`. Currency: TND. Code identifiers, class names, tables, and technical comments stay in English. UI strings go through i18n.

## Cross-cutting rules

1. Money is always integer millimes. 1 TND = 1000 millimes. Never use floating-point amounts. Format with `packages/shared/src/money.ts` (`12,500 TND`, or `12,500 د.ت` in Arabic, latin digits). `tndToMillimes` treats a single `,` or `.` as the decimal separator, so `"12,500"` and `"12.5"` are both 12.5 TND.
2. Identifiers are UUIDs (v7 when possible). Order ids are generated on the client so sends are idempotent. Sending the same `orderId` twice must not create a duplicate.
3. Store timestamps as `timestamptz` in UTC. Display them in `Africa/Tunis`.
4. Authorize every request on the server. Hiding a button is not enough. Each route declares the required permission.
5. Sensitive actions write `audit_log` (actor, device, action, before/after): create, send, add, cancellation request, cancellation decision, reprint, failed login, price or role change.
6. Do not physically delete orders, lines, or tickets. Change their status.
7. Hash PINs and passwords with `argon2id`. Rate-limit login routes. Lock the account temporarily after N failures. No secrets in Git (`.env` ignored, `.env.example` committed). Floor sessions last 12 hours and admin sessions last 2 hours. Errors use `{ error: { code, message, details? }, requestId }`.
8. Sending an order (status change + print jobs + recipe stock movements + audit + outbox) runs in a single database transaction. A short stock does not block the send. A job left in `PRINTING` when the hub starts returns to `PENDING`: a duplicate slip is preferred to a lost one. Text tickets print French only (PC858).
9. Do not add features outside the current step. Note improvements in `docs/ARCHITECTURE.md`, section « Idées ».

## Access

| Role      | Allowed devices                          | Auth             |
| --------- | ---------------------------------------- | ---------------- |
| `WAITER`  | Registered floor tablets                 | PIN              |
| `CASHIER` | Registered cashier PC                    | PIN              |
| `ADMIN`   | Tablet, phone, personal PC, or no device | Email + password |

A `PHONE` device accepts only `ADMIN`. Waiter and cashier logins require an active registered device. The waiter UI is order entry only: no void of a sent line, no stock, prices, or staff screens. Admin can do everything.

Hub dependency direction: `interfaces → application → domain`. `infrastructure` implements application ports. `domain` imports nothing technical.

The hub is the source of truth. Devices use HTTPS and Socket.IO. The service must keep working without internet. Cloud sync is out of scope; only the `sync_outbox` queue is prepared.

## Permissions

| Permission                                                                           | WAITER | CASHIER                     | ADMIN |
| ------------------------------------------------------------------------------------ | ------ | --------------------------- | ----- |
| `order.create` / `order.addItems` / `order.send`                                     | yes    | yes                         | yes   |
| `order.view.own`                                                                     | yes    | yes                         | yes   |
| `order.view.all`                                                                     | no     | yes                         | yes   |
| `cancellation.request`                                                               | yes    | yes                         | yes   |
| `cancellation.approve`                                                               | no     | only with an admin override | yes   |
| `order.reprint`                                                                      | no     | yes                         | yes   |
| `payment.create`                                                                     | no     | yes                         | yes   |
| `shift.manage`                                                                       | no     | yes                         | yes   |
| `catalog.availability`                                                               | no     | yes                         | yes   |
| `attendance.self`                                                                    | yes    | yes                         | yes   |
| `catalog.edit`, `stock.manage`, `inventory.manage`, `purchase.manage`, `expense.manage` | no  | no                          | yes   |
| `staff.manage`, `attendance.manage`, `printer.manage`, `settings.edit`               | no     | no                          | yes   |
| `device.manage`, `audit.view`, `report.view`                                         | no     | no                          | yes   |

Cashier override: `can('CASHIER', 'cancellation.approve')` and `can('CASHIER', 'order.discount')` are false. `requiresAdminOverride` is true for those two. The cashier submits an admin PIN or password. Audit the action with both identities. `order.discount` is the discount permission.

## Scope of this foundation

Build domains 1–5 plus audit and sync: identity-access, catalog, floor, ordering, printing, `audit_log`, `sync_outbox` (no cloud send).

The admin HTTP API covers catalogue edits, stock, purchases, inventory, staff, attendance, cash shifts, expenses, and management reports. Payments stay internal records. The waiter and cashier use `apps/web` against that hub. Admin screens are not built yet (`/admin` says they are coming).

## How to work

Follow the numbered steps. After each step run `pnpm typecheck && pnpm lint && pnpm test`, fix failures, commit with a conventional message (`feat:`, `fix:`, `chore:`), then summarize. Do not start the next step while something fails. If a fact is missing or two choices are real, ask a short question instead of inventing one.

## Out of scope

Admin screens, offline mode, local HTTPS, an installable PWA, Arabic ticket rendering, real cloud sync, split payments, cash-shift open/close on the floor, fiscal certification, and deployment onto the restaurant mini-PC.

## Done when

Every step’s success criteria is checked by a test or a reproducible demo. `pnpm typecheck && pnpm lint && pnpm test` pass. No secret is committed. One commit per step. End with a report: done, remaining, decisions, and risks (local HTTPS for the PWA, Arabic printing, hub downtime).
