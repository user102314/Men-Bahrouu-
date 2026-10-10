# Architecture

Local hub for one restaurant. The hub is the source of truth. Devices talk to it over the LAN. Cloud sync is only prepared through `sync_outbox`.

## Layers

`apps/hub` depends inward only: `interfaces` → `application` → `domain`. `infrastructure` implements application ports. `domain` imports nothing technical. Shared types, Zod schemas, money, and permissions live in `@resto/shared` and are imported by the hub and the web app through the package `exports` entry (`./src/index.ts`).

## Money and ids

Amounts are branded integer millimes. VAT is computed from a caller-supplied basis-point rate with half-up integer rounding: `round(gross * rate / (10000 + rate))`. Order and entity ids are UUID v7, monotonic within the same millisecond.

## Permissions

`can(role, permission)` is the server-side check. A cashier does not hold `cancellation.approve` or `order.discount`; `requiresAdminOverride` marks those two. The override flow itself is completed with the cancellation routes.

## Database

PostgreSQL 16 is published on `127.0.0.1` only. Drizzle migrations live in `apps/hub/drizzle`. `audit_log` is append-only.

## Idées

- Bind the dev Postgres port from an env var so two checkouts can run side by side.
- Revisit waiter/cashier device-type pairing if a floor tablet must also show cashier profiles.
