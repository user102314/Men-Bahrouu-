# Architecture

Local hub for one restaurant. The hub is the source of truth. Devices talk to it over the LAN. Cloud sync is only prepared through `sync_outbox`.

## Layers

`apps/hub` depends inward only: `interfaces` → `application` → `domain`. `infrastructure` implements application ports. `domain` imports nothing technical. Shared types, Zod schemas, money, and permissions live in `@resto/shared` and are imported by the hub and the web app through the package `exports` entry (`./src/index.ts`).

## Money and ids

Amounts are branded integer millimes. VAT is computed from a caller-supplied basis-point rate with half-up integer rounding: `round(gross * rate / (10000 + rate))`. Order and entity ids are UUID v7, monotonic within the same millisecond.

## Permissions

`can(role, permission)` is the server-side check. A cashier does not hold `cancellation.approve` or `order.discount`; `requiresAdminOverride` marks those two. The override flow itself is completed with the cancellation routes.

## HTTP

Every error is `{ error: { code, message, details? }, requestId }`. Stable codes include `AUTH_INVALID`, `AUTH_LOCKED`, `DEVICE_NOT_ALLOWED`, `FORBIDDEN`, and `VALIDATION_ERROR`. Login never reveals whether an account exists. A waiter uses only an active tablet, a cashier only an active cashier PC, and a phone accepts only an admin. Session tokens last 12 hours for floor staff and 2 hours for an admin. Each authenticated request reloads the user and the device, so a revocation takes effect immediately. Logs redact `pin`, `password`, `authorization`, and `x-device-token`.

## Business day

`businessDate` subtracts `BUSINESS_DAY_CUTOFF_HOUR` (default 5) from the current instant, then reads the calendar date in `Africa/Tunis`. A service that ends at 01:00 stays on the previous day. The cutoff is an absolute duration, so a daylight-saving gap can shift the boundary by one hour.

## Idées

- Bind the dev Postgres port from an env var so two checkouts can run side by side.

## Database

PostgreSQL 16 is published on `127.0.0.1` only. Drizzle migrations live in `apps/hub/drizzle`. Foreign keys use `ON DELETE RESTRICT`. Amounts are integers. `order_counters` allocates the daily number with `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, so concurrent sends cannot duplicate it. `audit_log` is append-only: a trigger rejects `UPDATE` and `DELETE`. `pnpm db:reset` and `pnpm db:seed` refuse to run when `NODE_ENV=production`. A reset regenerates device tokens. Failed PIN attempts increment `failed_attempts` in one `UPDATE ... RETURNING`, and set `locked_until` in that same statement once the threshold is reached. Integration tests use a separate database, `resto_test`.
