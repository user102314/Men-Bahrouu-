import net from "node:net";

import {
  PRINT_JOB_STATUSES,
  ticketPayloadSchema,
  type Permission,
  type PrintJobStatus,
} from "@resto/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import type { PrinterGateway } from "../../application/printer-gateway.js";
import { renderTicket } from "../../domain/printing/ticket-text.js";
import type { PrintService } from "../../infrastructure/printing/print-service.js";
import { AppError } from "./errors.js";

const listQuery = z.strictObject({
  status: z.enum(PRINT_JOB_STATUSES).optional(),
  orderId: z.uuid().optional(),
});

const reprintBody = z.strictObject({
  stationId: z.uuid().optional(),
});

const statusCache = new Map<string, { at: number; online: boolean }>();

export function registerPrintRoutes(
  app: FastifyInstance,
  deps: {
    printing: PrintService;
    gateway: PrinterGateway;
    columns: number;
    connectTimeoutMs: number;
    writeTimeoutMs: number;
    requirePermission: (permission: Permission) => (request: FastifyRequest) => Promise<void>;
  },
): void {
  app.get(
    "/print-jobs",
    { preHandler: deps.requirePermission("order.view.all") },
    async (request) => {
      const query = parse(listQuery, request.query);
      return {
        jobs: await deps.printing.list({
          ...(query.status ? { status: query.status } : {}),
          ...(query.orderId ? { orderId: query.orderId } : {}),
        }),
      };
    },
  );

  app.post(
    "/print-jobs/:id/retry",
    { preHandler: deps.requirePermission("order.reprint") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const current = required(request);
      const ok = await deps.printing.retry(params.id, current.id, current.deviceId);
      if (!ok) {
        throw new AppError(404, "NOT_FOUND", "Print job not found");
      }
      return { id: params.id, status: "PENDING" satisfies PrintJobStatus };
    },
  );

  app.post(
    "/orders/:id/reprint",
    { preHandler: deps.requirePermission("order.reprint") },
    async (request, reply) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const body = parse(reprintBody, request.body ?? {});
      const current = required(request);
      const created = await deps.printing.reprint(
        params.id,
        body.stationId ?? null,
        current.id,
        current.deviceId,
      );
      if (created === 0) {
        throw new AppError(404, "NOT_FOUND", "Nothing to reprint");
      }
      return reply.status(201).send({ created });
    },
  );

  app.post(
    "/printers/:id/test",
    { preHandler: deps.requirePermission("printer.manage") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const printers = await printerRows();
      const printer = printers.find((item) => item.id === params.id);
      if (!printer) {
        throw new AppError(404, "NOT_FOUND", "Printer not found");
      }
      const slip = ticketPayloadSchema.parse({
        type: "NEW",
        stationKind: "BAR",
        orderNumber: 1,
        tableLabel: null,
        serverName: "Test",
        createdAtIso: new Date().toISOString(),
        lines: [{ quantity: 1, nameFr: "Ticket de test" }],
      });
      try {
        await deps.gateway.send(
          { host: printer.host, port: printer.port },
          renderTicket(slip, deps.columns),
          {
            connectTimeoutMs: deps.connectTimeoutMs,
            writeTimeoutMs: deps.writeTimeoutMs,
          },
        );
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "print failed",
        };
      }
    },
  );

  app.get(
    "/printers/status",
    { preHandler: deps.requirePermission("order.view.all") },
    async () => {
      const printers = await printerRows();
      const now = Date.now();
      const results = [];
      for (const printer of printers) {
        const cached = statusCache.get(printer.id);
        const online =
          cached && now - cached.at < 10_000
            ? cached.online
            : await probe(printer.host, printer.port);
        statusCache.set(printer.id, { at: now, online });
        results.push({
          id: printer.id,
          name: printer.name,
          host: printer.host,
          port: printer.port,
          online,
        });
      }
      return { printers: results };
    },
  );

  function printerRows() {
    return deps.printing.listPrinters();
  }
}

function probe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 400);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function required(request: FastifyRequest) {
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
