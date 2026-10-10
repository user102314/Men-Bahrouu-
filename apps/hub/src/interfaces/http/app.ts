import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import {
  can,
  loginAdminSchema,
  loginPinSchema,
  registerDeviceSchema,
  requiresAdminOverride,
  type Permission,
  type Role,
} from "@resto/shared";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import type postgres from "postgres";
import { ZodError } from "zod";

import { AuthService, type SessionGrant } from "../../application/auth-service.js";
import type { SecretHasher } from "../../application/ports.js";
import type { AppConfig } from "../../config/env.js";
import { systemClock, type Clock } from "../../domain/auth/clock.js";
import { hashSecret, verifySecret } from "../../infrastructure/auth/argon2-hasher.js";
import { hashDeviceToken, newDeviceToken } from "../../infrastructure/auth/device-token.js";
import {
  createAuditRepository,
  createDeviceRepository,
  createUserRepository,
} from "../../infrastructure/db/repositories.js";
import { createOrderingStore } from "../../infrastructure/db/ordering-store.js";
import { attachRealtime } from "../realtime/hub.js";
import { AppError, errorBody } from "./errors.js";
import { registerOrderRoutes } from "./orders.js";

const REDACT_PATHS = [
  "pin",
  "password",
  "req.body.pin",
  "req.body.password",
  "req.body.adminOverride.password",
  "req.headers.authorization",
  'req.headers["x-device-token"]',
];

interface AuthState {
  id: string;
  role: Role;
  siteId: string;
  deviceId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthState;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: Role; siteId: string; deviceId?: string };
    user: { sub: string; role: Role; siteId: string; deviceId?: string };
  }
}

export interface BuildAppDeps {
  sql: postgres.Sql;
  config: AppConfig;
  clock?: Clock;
  logger?: FastifyServerOptions["logger"];
}

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const clock = deps.clock ?? systemClock;
  const app = Fastify({
    logger: loggerOptions(deps.logger),
  });
  const hasher: SecretHasher = { hash: hashSecret, verify: verifySecret };
  const auth = new AuthService(
    createUserRepository(deps.sql),
    createDeviceRepository(deps.sql),
    createAuditRepository(deps.sql),
    hasher,
    clock,
    {
      siteId: deps.config.siteId,
      lockoutAttempts: deps.config.lockoutAttempts,
      lockoutSeconds: deps.config.lockoutSeconds,
      waiterSessionSeconds: deps.config.waiterSessionSeconds,
      adminSessionSeconds: deps.config.adminSessionSeconds,
    },
    await hasher.hash("dummy-login-secret"),
    hashDeviceToken,
  );

  await app.register(helmet);
  await app.register(cors, {
    origin: [...deps.config.corsOrigins],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Token"],
  });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
  await app.register(jwt, { secret: deps.config.jwtSecret });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(errorBody(error.code, error.message, request.id, error.details));
    }
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined;
    if (statusCode === 429) {
      return reply.status(429).send(errorBody("RATE_LIMITED", "Too many requests", request.id));
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send(errorBody("INTERNAL", "Internal error", request.id));
  });

  app.get("/health", async (_request, reply) => {
    let db: "ok" | "down" = "ok";
    try {
      await deps.sql`select 1`;
    } catch {
      db = "down";
    }
    return reply.status(db === "ok" ? 200 : 503).send({
      status: db === "ok" ? "ok" : "down",
      db,
      version: deps.config.version,
    });
  });

  app.get("/auth/profiles", async (request, reply) => {
    const token = headerToken(request);
    if (!token) {
      throw new AppError(401, "AUTH_INVALID", "Invalid credentials");
    }
    const result = await auth.profiles(token);
    if (!result.ok) {
      throw failure(result.code, result.retryAfterSeconds);
    }
    return reply.send({ profiles: result.profiles });
  });

  app.post(
    "/auth/login-pin",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = parse(loginPinSchema, request.body);
      request.log.info({ pin: body.pin }, "pin login");
      const result = await auth.loginWithPin(body.userId, body.pin, headerToken(request));
      return sendSession(reply, app, result);
    },
  );

  app.post(
    "/auth/login-admin",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = parse(loginAdminSchema, request.body);
      request.log.info({ password: body.password }, "admin login");
      const result = await auth.loginAdmin(body.email, body.password, headerToken(request));
      return sendSession(reply, app, result);
    },
  );

  app.get("/auth/me", { preHandler: authenticate }, async (request) => {
    const current = requiredAuth(request);
    const user = await auth.activeSession(current.id, current.deviceId);
    if (!user) {
      throw new AppError(401, "AUTH_INVALID", "Invalid credentials");
    }
    return { id: user.id, displayName: user.displayName, role: user.role, siteId: user.siteId };
  });

  app.post("/auth/logout", { preHandler: authenticate }, async (request, reply) => {
    const current = requiredAuth(request);
    await auth.logout(current.id, current.deviceId);
    return reply.status(204).send();
  });

  app.get("/devices", { preHandler: requirePermission("device.manage") }, async () => {
    const devices = await auth.listDevices();
    return devices.map((device) => ({
      id: device.id,
      siteId: device.siteId,
      name: device.name,
      type: device.type,
      isActive: device.isActive,
    }));
  });

  app.post(
    "/devices",
    { preHandler: requirePermission("device.manage") },
    async (request, reply) => {
      const body = parse(registerDeviceSchema, request.body);
      const token = newDeviceToken();
      const created = await auth.registerDevice(
        requiredAuth(request).id,
        body.name,
        body.type,
        token,
        hashDeviceToken(token),
      );
      return reply.status(201).send(created);
    },
  );

  app.post(
    "/devices/:id/revoke",
    { preHandler: requirePermission("device.manage") },
    async (request) => {
      const params = request.params as { id: string };
      const revoked = await auth.revokeDevice(requiredAuth(request).id, params.id);
      if (!revoked) {
        throw new AppError(404, "NOT_FOUND", "Device not found");
      }
      return { id: revoked.id, isActive: revoked.isActive };
    },
  );

  const realtime = attachRealtime(app, auth, deps.config.corsOrigins);
  registerOrderRoutes(app, {
    auth,
    orders: createOrderingStore(deps.sql, {
      siteId: deps.config.siteId,
      cutoffHour: deps.config.businessDayCutoffHour,
    }),
    realtime,
    clock,
    authenticate,
    requirePermission,
  });

  return app;

  async function authenticate(request: FastifyRequest): Promise<void> {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError(401, "AUTH_INVALID", "Invalid credentials");
    }
    const user = await auth.activeSession(request.user.sub, request.user.deviceId ?? null);
    if (!user) {
      throw new AppError(401, "AUTH_INVALID", "Invalid credentials");
    }
    request.authUser = {
      id: user.id,
      role: user.role,
      siteId: user.siteId,
      deviceId: request.user.deviceId ?? null,
    };
  }

  function requirePermission(permission: Permission) {
    return async (request: FastifyRequest): Promise<void> => {
      await authenticate(request);
      const role = requiredAuth(request).role;
      if (can(role, permission)) {
        return;
      }
      const message = requiresAdminOverride(role, permission)
        ? "Admin override is required"
        : "Forbidden";
      throw new AppError(403, "FORBIDDEN", message);
    };
  }
}

function sendSession(
  reply: FastifyReply,
  app: FastifyInstance,
  result: SessionGrant | { ok: false; code: string; retryAfterSeconds?: number },
) {
  if (!result.ok) {
    throw failure(result.code, result.retryAfterSeconds);
  }
  const token = app.jwt.sign(
    {
      sub: result.userId,
      role: result.role,
      siteId: result.siteId,
      ...(result.deviceId ? { deviceId: result.deviceId } : {}),
    },
    { expiresIn: result.expiresInSeconds },
  );
  return reply.send({ token });
}

function failure(code: string, retryAfterSeconds?: number): AppError {
  const statusCode = code === "AUTH_INVALID" ? 401 : 403;
  const resolved = code === "AUTH_LOCKED" ? 401 : statusCode;
  return new AppError(
    resolved,
    code,
    code === "AUTH_LOCKED"
      ? "Account temporarily locked"
      : code === "DEVICE_NOT_ALLOWED"
        ? "Device not allowed"
        : "Invalid credentials",
    retryAfterSeconds === undefined ? undefined : { retryAfterSeconds },
  );
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

function headerToken(request: FastifyRequest): string | null {
  const raw = request.headers["x-device-token"];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || token.trim().length === 0) {
    return null;
  }
  return token;
}

function requiredAuth(request: FastifyRequest): AuthState {
  if (!request.authUser) {
    throw new AppError(401, "AUTH_INVALID", "Invalid credentials");
  }
  return request.authUser;
}

function loggerOptions(override: FastifyServerOptions["logger"] | undefined) {
  const redact = { paths: REDACT_PATHS, censor: "[Redacted]" };
  if (override && typeof override === "object") {
    return { level: "info" as const, redact, ...override };
  }
  return { level: "info" as const, redact };
}
