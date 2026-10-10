# Architecture

Local hub for one restaurant. The hub is the source of truth. Devices talk to it over the LAN. Cloud sync is only prepared through `sync_outbox`.

## Layers

`apps/hub` depends inward only: `interfaces` → `application` → `domain`. `infrastructure` implements application ports. `domain` imports nothing technical. Shared types, Zod schemas, money, and permissions live in `@resto/shared` and are imported by the hub and the web app through the package `exports` entry (`./src/index.ts`).

## Money and ids

Amounts are branded integer millimes. VAT is computed from a caller-supplied basis-point rate with half-up integer rounding: `round(gross * rate / (10000 + rate))`. Order and entity ids are UUID v7, monotonic within the same millisecond.

## Permissions

`can(role, permission)` is the server-side check. A cashier does not hold `cancellation.approve` or `order.discount`; `requiresAdminOverride` marks those two. Approving a cancellation checks an admin password on the hub and writes both identities to the audit log.

## HTTP

Every error is `{ error: { code, message, details? }, requestId }`. Stable codes include `AUTH_INVALID`, `AUTH_LOCKED`, `DEVICE_NOT_ALLOWED`, `FORBIDDEN`, and `VALIDATION_ERROR`. Login never reveals whether an account exists. A waiter uses only an active tablet, a cashier only an active cashier PC, and a phone accepts only an admin. Session tokens last 12 hours for floor staff and 2 hours for an admin. Each authenticated request reloads the user and the device, so a revocation takes effect immediately. Logs redact `pin`, `password`, `authorization`, and `x-device-token`.

## Business day

`businessDate` subtracts `BUSINESS_DAY_CUTOFF_HOUR` (default 5) from the current instant, then reads the calendar date in `Africa/Tunis`. A service that ends at 01:00 stays on the previous day. The cutoff is an absolute duration, so a daylight-saving gap can shift the boundary by one hour.

## Orders

A client-generated order id is idempotent for the same server. Another server using that id receives `ORDER_ID_CONFLICT`. Prices are copied from the catalog when the line is added. Sending, printing, audit, and the outbox row share one transaction; realtime events fire after commit. At most one `DRAFT`, `SENT`, or `SERVED` order may reference a table. An unsent line is voided in place rather than deleted. A cashier approves a cancellation only with an admin password, and the audit row stores both identities.

Socket.IO joins `site`, `role`, and `user` rooms. Order events go to the order's server plus cashier and admin. Table events go to every role. Print events go to cashier and admin.

## Printing

Preparation tickets are ESC/POS text in code page PC858. The degree sign uses byte `0xF8`. The ligature `œ` is printed as `oe` because that page has no glyph for it. Arabic names stay in the payload and are not drawn on the text ticket. The hub claims pending jobs with `FOR UPDATE SKIP LOCKED`, so two workers cannot print the same slip. A job left in `PRINTING` when the hub starts is set back to `PENDING`: a duplicate slip is preferred to a lost one. After five failures the job moves to the station's fallback printer once, then becomes `FAILED`. Same-printer jobs are sent one after another; different printers run in parallel.

## Idées

- Bind the dev Postgres port from an env var so two checkouts can run side by side.
- Render Arabic ticket lines as images; the text renderer prints French only.

## Database

PostgreSQL 16 is published on `127.0.0.1` only. Drizzle migrations live in `apps/hub/drizzle`. Foreign keys use `ON DELETE RESTRICT`. Amounts are integers. `order_counters` allocates the daily number with `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, so concurrent sends cannot duplicate it. `audit_log` is append-only: a trigger rejects `UPDATE` and `DELETE`. `pnpm db:reset` and `pnpm db:seed` refuse to run when `NODE_ENV=production`. A reset regenerates device tokens. Failed PIN attempts increment `failed_attempts` in one `UPDATE ... RETURNING`, and set `locked_until` in that same statement once the threshold is reached. Integration tests use a separate database, `resto_test`.
