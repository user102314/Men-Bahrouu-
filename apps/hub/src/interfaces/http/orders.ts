import {
  addItemsSchema,
  can,
  requiresAdminOverride,
  createOrderSchema,
  decideCancellationSchema,
  ORDER_STATUSES,
  requestCancellationSchema,
  updateOrderItemSchema,
  type Permission,
} from "@resto/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import type { AuthService } from "../../application/auth-service.js";
import type { Clock } from "../../domain/auth/clock.js";
import { DomainError, domainHttp, type DomainCode } from "../../domain/ordering/errors.js";
import type { OrderingStore, RealtimeMessage } from "../../infrastructure/db/ordering-store.js";
import type { RealtimeHub } from "../realtime/hub.js";
import { AppError } from "./errors.js";

const listQuerySchema = z.strictObject({
  status: z.enum(ORDER_STATUSES).optional(),
  tableId: z.uuid().optional(),
  mine: z.enum(["true", "false"]).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const cancellationQuerySchema = z.strictObject({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
});

interface AuthState {
  id: string;
  role: "ADMIN" | "CASHIER" | "WAITER";
  siteId: string;
  deviceId: string | null;
}

export function registerOrderRoutes(
  app: FastifyInstance,
  deps: {
    auth: AuthService;
    orders: OrderingStore;
    realtime: RealtimeHub;
    clock: Clock;
    authenticate: (request: FastifyRequest) => Promise<void>;
    requirePermission: (permission: Permission) => (request: FastifyRequest) => Promise<void>;
    onCommitted?: () => void;
  },
): void {
  const { orders, realtime, clock } = deps;

  app.get("/catalog", { preHandler: deps.requirePermission("order.view.own") }, async () =>
    orders.catalog(),
  );

  app.get("/tables", { preHandler: deps.requirePermission("order.view.own") }, async (request) =>
    orders.tables(actor(request)),
  );

  app.get("/daily-specials", { preHandler: deps.requirePermission("order.view.own") }, async () =>
    orders.dailySpecials(clock.now()),
  );

  app.post(
    "/orders",
    { preHandler: deps.requirePermission("order.create") },
    async (request, reply) => {
      const body = parse(createOrderSchema, request.body);
      const result = await run(() => orders.create(actor(request), body, clock.now()));
      finish(realtime, result.events, deps.onCommitted);
      return reply.status(result.created ? 201 : 200).send(result.order);
    },
  );

  app.get("/orders", { preHandler: deps.requirePermission("order.view.own") }, async (request) => {
    const query = parse(listQuerySchema, request.query);
    const current = actor(request);
    return run(() =>
      orders.list(current, {
        ...(query.status ? { status: query.status } : {}),
        ...(query.tableId ? { tableId: query.tableId } : {}),
        mine: current.role === "WAITER" || query.mine === "true",
        ...(query.cursor ? { cursor: query.cursor } : {}),
        limit: query.limit ?? 30,
      }),
    );
  });

  app.get(
    "/orders/:id",
    { preHandler: deps.requirePermission("order.view.own") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const current = actor(request);
      return run(() => orders.get(current, params.id, can(current.role, "order.view.all")));
    },
  );

  app.post(
    "/orders/:id/items",
    { preHandler: deps.requirePermission("order.addItems") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const body = parse(addItemsSchema, request.body);
      const result = await run(() =>
        orders.addItems(actor(request), params.id, body.items, clock.now()),
      );
      finish(realtime, result.events, deps.onCommitted);
      return result.order;
    },
  );

  app.patch(
    "/orders/:id/items/:itemId",
    { preHandler: deps.requirePermission("order.addItems") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid(), itemId: z.uuid() }), request.params);
      const body = parse(updateOrderItemSchema, request.body);
      const result = await run(() =>
        orders.updateItem(actor(request), params.id, params.itemId, body, clock.now()),
      );
      finish(realtime, result.events, deps.onCommitted);
      return result.order;
    },
  );

  app.delete(
    "/orders/:id/items/:itemId",
    { preHandler: deps.requirePermission("order.addItems") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid(), itemId: z.uuid() }), request.params);
      const result = await run(() =>
        orders.deleteItem(actor(request), params.id, params.itemId, clock.now()),
      );
      finish(realtime, result.events, deps.onCommitted);
      return result.order;
    },
  );

  app.post(
    "/orders/:id/send",
    { preHandler: deps.requirePermission("order.send") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const result = await run(() => orders.send(actor(request), params.id, clock.now()));
      finish(realtime, result.events, deps.onCommitted);
      return result.order;
    },
  );

  app.post(
    "/orders/:id/request-bill",
    { preHandler: deps.requirePermission("order.markServed") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const result = await run(() => orders.requestBill(actor(request), params.id));
      finish(realtime, result.events, deps.onCommitted);
      return result.order;
    },
  );

  app.post(
    "/orders/:id/served",
    { preHandler: deps.requirePermission("order.markServed") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const result = await run(() => orders.markServed(actor(request), params.id));
      finish(realtime, result.events, deps.onCommitted);
      return result.order;
    },
  );

  app.post(
    "/orders/:id/cancellation-requests",
    { preHandler: deps.requirePermission("cancellation.request") },
    async (request, reply) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const body = parse(requestCancellationSchema, request.body);
      const result = await run(() =>
        orders.requestCancellation(
          actor(request),
          params.id,
          body.orderItemId ?? null,
          body.reason,
        ),
      );
      finish(realtime, result.events, deps.onCommitted);
      return reply.status(201).send({ cancellationId: result.cancellationId, order: result.order });
    },
  );

  app.get(
    "/cancellation-requests",
    { preHandler: deps.requirePermission("order.view.all") },
    async (request) => {
      const query = parse(cancellationQuerySchema, request.query);
      return orders.listCancellations(query.status);
    },
  );

  app.post(
    "/cancellation-requests/:id/decision",
    { preHandler: deps.authenticate },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const body = parse(decideCancellationSchema, request.body);
      const current = actor(request);
      if (!can(current.role, "cancellation.approve")) {
        throw new AppError(403, "FORBIDDEN", "Forbidden");
      }
      let overrideBy: string | null = null;
      if (body.approve && requiresAdminOverride(current.role, "cancellation.approve")) {
        if (!body.adminOverride) {
          throw new AppError(403, "OVERRIDE_REQUIRED", "Admin override is required");
        }
        const verified = await deps.auth.verifyAdminOverride(
          body.adminOverride.email,
          body.adminOverride.password,
        );
        if (!verified.ok) {
          throw overrideFailure(verified.code, verified.retryAfterSeconds);
        }
        overrideBy = verified.userId;
      }
      const result = await run(() =>
        orders.decideCancellation(current, params.id, body.approve, overrideBy, clock.now()),
      );
      finish(realtime, result.events, deps.onCommitted);
      return result.order;
    },
  );
}

function finish(realtime: RealtimeHub, events: RealtimeMessage[], onCommitted?: () => void): void {
  realtime.publish(events);
  onCommitted?.();
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) {
      throw toAppError(error.code);
    }
    throw error;
  }
}

function toAppError(code: DomainCode): AppError {
  const entry = domainHttp(code);
  return new AppError(entry.status, code, entry.message);
}

function overrideFailure(code: string, retryAfterSeconds?: number): AppError {
  if (code === "AUTH_LOCKED") {
    return new AppError(401, "AUTH_LOCKED", "Account temporarily locked", { retryAfterSeconds });
  }
  return new AppError(401, "AUTH_INVALID", "Invalid credentials");
}

function actor(request: FastifyRequest): AuthState {
  if (!request.authUser) {
    throw new AppError(401, "AUTH_INVALID", "Invalid credentials");
  }
  return request.authUser;
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Invalid request",
        error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      );
    }
    throw error;
  }
}
