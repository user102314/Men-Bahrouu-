import {
  businessDate,
  can,
  attendanceRangeSchema,
  auditQuerySchema,
  availabilitySchema,
  cashMovementSchema,
  changeRoleSchema,
  closeShiftSchema,
  createCategorySchema,
  createPaymentSchema,
  createPrinterSchema,
  createProductSchema,
  createPurchaseSchema,
  createStockItemSchema,
  createTableSchema,
  createUserSchema,
  editAttendanceSchema,
  expenseCategorySchema,
  expenseSchema,
  inventorySchema,
  manualMovementSchema,
  openShiftSchema,
  putStaffShiftsSchema,
  recipeSchema,
  renameZoneSchema,
  reorderSchema,
  reportQuerySchema,
  settingsPutSchema,
  shiftNoteSchema,
  supplierSchema,
  updateCategorySchema,
  updateExpenseSchema,
  updatePrinterSchema,
  updateProductSchema,
  updatePurchaseSchema,
  updateStationSchema,
  updateStockItemSchema,
  updateSupplierSchema,
  updateTableSchema,
  updateUserSchema,
  type Permission,
} from "@resto/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import type { Clock } from "../../domain/auth/clock.js";
import { DomainError, domainHttp } from "../../domain/ordering/errors.js";
import { createAdminStore } from "../../infrastructure/db/admin-store.js";
import {
  decodeProductImage,
  readProductImage,
  removeProductImage,
  writeProductImage,
} from "../../infrastructure/files/product-images.js";
import { buildReport, serviceProductLines, toCsv } from "../../infrastructure/db/reports.js";
import type { RealtimeHub } from "../realtime/hub.js";
import { AppError } from "./errors.js";

interface Actor {
  id: string;
  role: "ADMIN" | "CASHIER" | "WAITER";
  siteId: string;
  deviceId: string | null;
}

export function registerAdminRoutes(
  app: FastifyInstance,
  deps: {
    sql: Parameters<typeof createAdminStore>[0];
    realtime: RealtimeHub;
    clock: Clock;
    siteId: string;
    cutoffHour: number;
    printColumns: number;
    vatBp: number;
    authenticate: (request: FastifyRequest) => Promise<void>;
    requirePermission: (permission: Permission) => (request: FastifyRequest) => Promise<void>;
  },
): void {
  const admin = createAdminStore(deps.sql, {
    siteId: deps.siteId,
    cutoffHour: deps.cutoffHour,
    printColumns: deps.printColumns,
    vatBp: deps.vatBp,
  });
  const permit = deps.requirePermission;
  const either = (left: Permission, right: Permission) => {
    return async (request: FastifyRequest): Promise<void> => {
      await deps.authenticate(request);
      const role = actor(request).role;
      if (!can(role, left) && !can(role, right)) {
        throw new AppError(403, "FORBIDDEN", "Forbidden");
      }
    };
  };

  app.get("/product-images/:id", async (request, reply) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    const imageType = await admin.productImageType(params.id);
    if (!imageType) {
      return reply.status(404).send();
    }
    const bytes = await readProductImage(
      params.id,
      imageType as "image/jpeg" | "image/png" | "image/webp",
    );
    return reply.type(imageType).header("cache-control", "no-cache").send(bytes);
  });

  app.get("/settings", { preHandler: permit("settings.edit") }, async () => admin.settings());
  app.put("/settings", { preHandler: permit("settings.edit") }, async (request) => {
    const result = await run(() =>
      admin.putSettings(actor(request), parse(settingsPutSchema, request.body)),
    );
    deps.realtime.publish(result.events);
    return result.settings;
  });

  const dailyPutSchema = z
    .strictObject({
      productIds: z.array(z.uuid()).max(40).optional(),
      offers: z
        .array(
          z.strictObject({
            id: z.uuid(),
            productId: z.uuid().nullable(),
            nameFr: z.string().trim().min(1).max(80),
            nameAr: z.string().trim().min(1).max(80),
            priceMillimes: z.number().int().nonnegative(),
            confirmHighPrice: z.boolean().optional(),
          }),
        )
        .max(40)
        .optional(),
    })
    .refine((value) => value.productIds !== undefined || value.offers !== undefined, {
      message: "At least one field is required",
    });

  app.put("/daily-specials", { preHandler: permit("catalog.edit") }, async (request) => {
    const body = parse(dailyPutSchema, request.body);
    const offers = body.offers;
    if (offers !== undefined) {
      const saved = await run(() =>
        admin.saveDailyOffers(actor(request), offers, deps.clock.now()),
      );
      deps.realtime.publish(saved.events);
      return saved.menu;
    }
    const [current, products] = await Promise.all([admin.settings(), admin.listProducts()]);
    const active = new Set(
      (products as unknown as { id: string; is_active: boolean }[])
        .filter((product) => product.is_active)
        .map((product) => product.id),
    );
    const productIds = [...new Set(body.productIds ?? [])].filter((id) => active.has(id));
    const today = businessDate(deps.clock.now(), current.businessDayCutoffHour);
    const result = await run(() =>
      admin.putSettings(actor(request), { dailySpecials: { businessDate: today, productIds } }),
    );
    deps.realtime.publish(result.events);
    return { businessDate: today, productIds, offers: [] as never[] };
  });

  app.post("/categories", { preHandler: permit("catalog.edit") }, async (request, reply) => {
    const created = await run(() =>
      admin.createCategory(actor(request), parse(createCategorySchema, request.body)),
    );
    return reply.status(201).send(created);
  });
  app.patch("/categories/:id", { preHandler: permit("catalog.edit") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updateCategory(actor(request), params.id, parse(updateCategorySchema, request.body)),
    );
  });
  app.post("/categories/reorder", { preHandler: permit("catalog.edit") }, async (request) => {
    const body = parse(reorderSchema, request.body);
    await run(() => admin.reorderCategories(actor(request), body.ids));
    return { ok: true };
  });
  app.post("/products", { preHandler: permit("catalog.edit") }, async (request, reply) => {
    const created = await run(() =>
      admin.createProduct(actor(request), parse(createProductSchema, request.body)),
    );
    return reply.status(201).send(created);
  });
  app.patch("/products/:id", { preHandler: permit("catalog.edit") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updateProduct(actor(request), params.id, parse(updateProductSchema, request.body)),
    );
  });
  app.post("/products/reorder", { preHandler: permit("catalog.edit") }, async (request) => {
    const body = parse(reorderSchema, request.body);
    await run(() => admin.reorderProducts(actor(request), body.ids));
    return { ok: true };
  });
  app.put("/products/:id/image", { preHandler: permit("catalog.edit") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    const body = parse(
      z.strictObject({
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        dataBase64: z.string().min(16).max(2_100_000),
      }),
      request.body,
    );
    let image: ReturnType<typeof decodeProductImage>;
    try {
      image = decodeProductImage(body.contentType, body.dataBase64);
    } catch {
      throw new AppError(400, "INVALID_IMAGE", "Image illisible");
    }
    await writeProductImage(params.id, image.type, image.bytes);
    try {
      return await run(() => admin.setProductImage(actor(request), params.id, image.type));
    } catch (error) {
      await removeProductImage(params.id);
      throw error;
    }
  });
  app.delete("/products/:id/image", { preHandler: permit("catalog.edit") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    const cleared = await run(() => admin.setProductImage(actor(request), params.id, null));
    await removeProductImage(params.id);
    return cleared;
  });
  app.patch(
    "/products/:id/availability",
    { preHandler: permit("catalog.availability") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const body = parse(availabilitySchema, request.body);
      const event = await run(() =>
        admin.setAvailability(actor(request), params.id, body.isAvailable),
      );
      deps.realtime.publish([event]);
      return { id: params.id, isAvailable: body.isAvailable };
    },
  );
  app.get("/admin/products", { preHandler: permit("catalog.edit") }, async () => ({
    products: await admin.listProducts(),
  }));
  app.get("/admin/categories", { preHandler: permit("catalog.edit") }, async () => ({
    categories: await admin.listCategories(),
  }));
  app.get("/admin/stations", { preHandler: permit("printer.manage") }, async () => ({
    stations: await admin.listStations(),
  }));
  app.get("/admin/printers", { preHandler: permit("printer.manage") }, async () => ({
    printers: await admin.listPrinters(),
  }));
  app.get("/products/:id/ingredients", { preHandler: permit("stock.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return { ingredients: await admin.getRecipe(params.id) };
  });

  app.post(
    "/tables",
    { preHandler: either("settings.edit", "shift.manage") },
    async (request, reply) => {
      const created = await run(() =>
        admin.createTable(actor(request), parse(createTableSchema, request.body)),
      );
      return reply.status(201).send(created);
    },
  );
  app.patch("/tables/:id", { preHandler: permit("settings.edit") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updateTable(actor(request), params.id, parse(updateTableSchema, request.body)),
    );
  });
  app.post("/tables/zones", { preHandler: permit("settings.edit") }, async (request) =>
    run(() => {
      const body = parse(renameZoneSchema, request.body);
      return admin.renameZone(actor(request), body.from, body.to);
    }),
  );

  app.post("/printers", { preHandler: permit("printer.manage") }, async (request, reply) => {
    const created = await run(() =>
      admin.createPrinter(actor(request), parse(createPrinterSchema, request.body)),
    );
    return reply.status(201).send(created);
  });
  app.patch("/printers/:id", { preHandler: permit("printer.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updatePrinter(actor(request), params.id, parse(updatePrinterSchema, request.body)),
    );
  });
  app.patch("/stations/:id", { preHandler: permit("printer.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updateStation(actor(request), params.id, parse(updateStationSchema, request.body)),
    );
  });

  app.get("/users", { preHandler: permit("staff.manage") }, async () => ({
    users: await admin.listUsers(),
  }));
  app.post("/users", { preHandler: permit("staff.manage") }, async (request, reply) => {
    const created = await run(() =>
      admin.createUser(actor(request), parse(createUserSchema, request.body)),
    );
    return reply.status(201).send(created);
  });
  app.patch("/users/:id", { preHandler: permit("staff.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updateUser(actor(request), params.id, parse(updateUserSchema, request.body)),
    );
  });
  app.post("/users/:id/reset-pin", { preHandler: permit("staff.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() => admin.resetPin(actor(request), params.id));
  });
  app.post("/users/:id/deactivate", { preHandler: permit("staff.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() => admin.setActive(actor(request), params.id, false));
  });
  app.post("/users/:id/reactivate", { preHandler: permit("staff.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() => admin.setActive(actor(request), params.id, true));
  });
  app.patch("/users/:id/role", { preHandler: permit("staff.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    const body = parse(changeRoleSchema, request.body);
    return run(() => admin.setRole(actor(request), params.id, body));
  });

  app.post(
    "/attendance/clock-in",
    { preHandler: permit("attendance.self") },
    async (request, reply) => {
      const created = await run(() => admin.clockIn(actor(request), deps.clock.now()));
      return reply.status(201).send(created);
    },
  );
  app.post("/attendance/clock-out", { preHandler: permit("attendance.self") }, async (request) =>
    run(() => admin.clockOut(actor(request), deps.clock.now())),
  );
  app.get("/attendance", { preHandler: deps.authenticate }, async (request) => {
    const current = actor(request);
    if (current.role !== "ADMIN" && current.role !== "CASHIER" && current.role !== "WAITER") {
      throw new AppError(403, "FORBIDDEN", "Forbidden");
    }
    return run(() => admin.listAttendance(current, parse(attendanceRangeSchema, request.query)));
  });
  app.patch("/attendance/:id", { preHandler: permit("attendance.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.editAttendance(actor(request), params.id, parse(editAttendanceSchema, request.body)),
    );
  });
  app.get("/staff-shifts", { preHandler: permit("staff.manage") }, async (request) => {
    const query = parse(z.strictObject({ week: z.iso.date() }), request.query);
    return { slots: await admin.getStaffShifts(query.week) };
  });
  app.put("/staff-shifts", { preHandler: permit("staff.manage") }, async (request) => {
    const body = parse(putStaffShiftsSchema, request.body);
    return run(() => admin.putStaffShifts(actor(request), body.weekStart, body.slots));
  });

  app.get("/stock-items", { preHandler: permit("stock.manage") }, async () => ({
    items: await admin.listStock(),
  }));
  app.post("/stock-items", { preHandler: permit("stock.manage") }, async (request, reply) => {
    const created = await run(() =>
      admin.createStockItem(actor(request), parse(createStockItemSchema, request.body)),
    );
    return reply.status(201).send(created);
  });
  app.patch("/stock-items/:id", { preHandler: permit("stock.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updateStockItem(actor(request), params.id, parse(updateStockItemSchema, request.body)),
    );
  });
  app.get("/stock-items/:id/movements", { preHandler: permit("stock.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return { movements: await admin.stockMovements(params.id) };
  });
  app.put("/products/:id/ingredients", { preHandler: permit("stock.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    const body = parse(recipeSchema, request.body);
    return run(() => admin.setRecipe(actor(request), params.id, body.ingredients));
  });
  app.post("/stock-movements", { preHandler: permit("stock.manage") }, async (request, reply) => {
    const created = await run(() =>
      admin.manualMovement(actor(request), parse(manualMovementSchema, request.body)),
    );
    return reply.status(201).send(created);
  });
  app.get("/stock/alerts", { preHandler: permit("stock.manage") }, async () => ({
    items: await admin.stockAlerts(),
  }));
  app.post(
    "/stock/inventories",
    { preHandler: permit("inventory.manage") },
    async (request, reply) => {
      const created = await run(() =>
        admin.takeInventory(actor(request), parse(inventorySchema, request.body)),
      );
      return reply.status(201).send(created);
    },
  );

  app.get("/suppliers", { preHandler: permit("purchase.manage") }, async () => ({
    suppliers: await admin.listSuppliers(),
  }));
  app.post("/suppliers", { preHandler: permit("purchase.manage") }, async (request, reply) => {
    const created = await run(() =>
      admin.createSupplier(actor(request), parse(supplierSchema, request.body)),
    );
    return reply.status(201).send(created);
  });
  app.patch("/suppliers/:id", { preHandler: permit("purchase.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updateSupplier(actor(request), params.id, parse(updateSupplierSchema, request.body)),
    );
  });
  app.post("/purchases", { preHandler: permit("purchase.manage") }, async (request, reply) => {
    const created = await run(() =>
      admin.createPurchase(actor(request), parse(createPurchaseSchema, request.body)),
    );
    return reply.status(201).send(created);
  });
  app.patch("/purchases/:id", { preHandler: permit("purchase.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updatePurchase(actor(request), params.id, parse(updatePurchaseSchema, request.body)),
    );
  });
  app.post("/purchases/:id/receive", { preHandler: permit("purchase.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() => admin.receivePurchase(actor(request), params.id, deps.clock.now()));
  });
  app.post("/purchases/:id/cancel", { preHandler: permit("purchase.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() => admin.cancelPurchase(actor(request), params.id));
  });
  app.post(
    "/purchases/:id/mark-paid",
    { preHandler: permit("purchase.manage") },
    async (request) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      return run(() => admin.markPurchasePaid(actor(request), params.id));
    },
  );

  app.post("/expenses", { preHandler: permit("expense.manage") }, async (request, reply) => {
    const created = await run(() =>
      admin.createExpense(actor(request), parse(expenseSchema, request.body)),
    );
    return reply.status(201).send(created);
  });
  app.patch("/expenses/:id", { preHandler: permit("expense.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    return run(() =>
      admin.updateExpense(actor(request), params.id, parse(updateExpenseSchema, request.body)),
    );
  });
  app.get("/expenses", { preHandler: permit("expense.manage") }, async (request) => {
    const query = parse(
      z.strictObject({
        from: z.iso.date(),
        to: z.iso.date(),
        category: expenseCategorySchema.optional(),
      }),
      request.query,
    );
    return { expenses: await admin.listExpenses(query.from, query.to, query.category) };
  });

  app.post("/cash-shifts/open", { preHandler: permit("shift.manage") }, async (request, reply) => {
    const result = await run(() =>
      admin.openShift(actor(request), parse(openShiftSchema, request.body), deps.clock.now()),
    );
    deps.realtime.publish(result.events);
    return reply.status(201).send(result.shift);
  });
  app.post(
    "/cash-shifts/:id/cash-movements",
    { preHandler: permit("shift.manage") },
    async (request, reply) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const created = await run(() =>
        admin.cashMovement(actor(request), params.id, parse(cashMovementSchema, request.body)),
      );
      return reply.status(201).send(created);
    },
  );
  app.post("/cash-shifts/:id/close", { preHandler: permit("shift.manage") }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    const result = await run(() =>
      admin.closeShift(
        actor(request),
        params.id,
        parse(closeShiftSchema, request.body),
        deps.clock.now(),
      ),
    );
    deps.realtime.publish(result.events);
    return { expectedMillimes: result.expectedMillimes, varianceMillimes: result.varianceMillimes };
  });
  app.patch("/cash-shifts/:id", { preHandler: deps.authenticate }, async (request) => {
    const params = parse(z.strictObject({ id: z.uuid() }), request.params);
    const body = parse(shiftNoteSchema, request.body);
    return run(() => admin.noteShift(actor(request), params.id, body.note));
  });
  app.get("/service-recette", { preHandler: permit("shift.manage") }, async () => {
    const current = await admin.settings();
    return recetteReport(current.serviceRecette, deps.clock.now());
  });
  app.post("/service-recette/open", { preHandler: permit("shift.manage") }, async (request) => {
    const current = await admin.settings();
    if (current.serviceRecette.status === "OPEN") {
      throw new AppError(409, "INVALID_TRANSITION", "Morning service is already open");
    }
    const now = deps.clock.now();
    const next = {
      status: "OPEN" as const,
      businessDate: businessDate(now, current.businessDayCutoffHour),
      openedAt: now.toISOString(),
      closedAt: null,
    };
    const saved = await run(() => admin.putSettings(actor(request), { serviceRecette: next }));
    deps.realtime.publish(saved.events);
    return recetteReport(next, now);
  });
  app.post("/service-recette/close", { preHandler: permit("shift.manage") }, async (request) => {
    const current = await admin.settings();
    if (current.serviceRecette.status !== "OPEN" || current.serviceRecette.openedAt.length === 0) {
      throw new AppError(409, "INVALID_TRANSITION", "Morning service is not open");
    }
    const now = deps.clock.now();
    const next = {
      ...current.serviceRecette,
      status: "CLOSED" as const,
      closedAt: now.toISOString(),
    };
    const saved = await run(() => admin.putSettings(actor(request), { serviceRecette: next }));
    deps.realtime.publish(saved.events);
    return recetteReport(next, now);
  });

  async function recetteReport(
    service: {
      status: "OPEN" | "CLOSED";
      businessDate: string;
      openedAt: string;
      closedAt: string | null;
    },
    now: Date,
  ) {
    if (service.openedAt.length === 0) {
      return {
        notice: "Rapport de gestion, pas un document fiscal",
        service: null,
        products: [],
        totals: {
          all: { quantity: 0, revenueMillimes: 0 },
          bar: { quantity: 0, revenueMillimes: 0 },
          kitchen: { quantity: 0, revenueMillimes: 0 },
        },
      };
    }
    const until =
      service.status === "OPEN" ? now.toISOString() : (service.closedAt ?? now.toISOString());
    const rows = await serviceProductLines(deps.sql, deps.siteId, service.openedAt, until);
    const products = rows.map((row) => ({
      nameFr: row.name_fr,
      stationKind: row.kind,
      quantity: row.quantity,
      revenueMillimes: row.revenue_millimes,
    }));
    const total = (kind?: "BAR" | "KITCHEN") => {
      const picked = kind ? products.filter((line) => line.stationKind === kind) : products;
      return {
        quantity: picked.reduce((sum, line) => sum + line.quantity, 0),
        revenueMillimes: picked.reduce((sum, line) => sum + line.revenueMillimes, 0),
      };
    };
    return {
      notice: "Rapport de gestion, pas un document fiscal",
      service,
      products,
      totals: { all: total(), bar: total("BAR"), kitchen: total("KITCHEN") },
    };
  }

  app.get("/cash-shifts/current", { preHandler: permit("shift.manage") }, async (request) => {
    const current = actor(request);
    if (!current.deviceId) {
      return { shift: null };
    }
    const rows = await admin.currentShift(current.deviceId);
    return { shift: rows[0] ?? null };
  });
  app.get(
    "/cash-shifts",
    { preHandler: either("shift.manage", "report.view") },
    async (request) => {
      const query = parse(
        z.strictObject({
          from: z.iso.datetime().optional(),
          to: z.iso.datetime().optional(),
          status: z.string().optional(),
        }),
        request.query,
      );
      return { shifts: await admin.listShifts(query.from, query.to, query.status) };
    },
  );

  app.post(
    "/orders/:id/payments",
    { preHandler: permit("payment.create") },
    async (request, reply) => {
      const params = parse(z.strictObject({ id: z.uuid() }), request.params);
      const body = parse(createPaymentSchema, request.body);
      if (body.method === "CASH" && body.tenderedMillimes === undefined) {
        throw new AppError(400, "VALIDATION_ERROR", "Tendered amount is required for cash");
      }
      if (body.method !== "CASH" && body.tenderedMillimes !== undefined) {
        throw new AppError(400, "VALIDATION_ERROR", "Tendered amount is only for cash");
      }
      const result = await run(() => admin.pay(actor(request), params.id, body, deps.clock.now()));
      deps.realtime.publish(result.events);
      return reply.status(201).send({ notice: result.notice, payment: result.payment });
    },
  );

  const reportKinds = [
    ["dashboard", "/reports/dashboard"],
    ["by-hour", "/reports/sales/by-hour"],
    ["by-day", "/reports/sales/by-day"],
    ["products", "/reports/products/top"],
    ["product-analysis", "/reports/product-analysis"],
    ["payments", "/reports/payments"],
    ["stations", "/reports/stations"],
    ["servers", "/reports/servers"],
    ["voids", "/reports/voids"],
    ["daily-close", "/reports/daily-close"],
    ["stock-valuation", "/reports/stock-valuation"],
    ["food-cost", "/reports/food-cost"],
    ["staff-hours", "/reports/staff-hours"],
  ] as const;
  for (const [kind, path] of reportKinds) {
    app.get(path, { preHandler: permit("report.view") }, async (request, reply) =>
      sendReport(
        reply,
        deps.sql,
        deps.siteId,
        kind,
        parse(reportQuerySchema.partial({ from: true, to: true }), request.query),
      ),
    );
  }

  app.get("/audit", { preHandler: permit("audit.view") }, async (request) => {
    const query = parse(auditQuerySchema, request.query);
    const limit = query.limit ?? 30;
    const rows = await deps.sql<
      {
        id: string;
        actor_user_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string | null;
        before: unknown;
        after: unknown;
        at: Date;
      }[]
    >`
      select id, actor_user_id, action, entity_type, entity_id, before, after, at
      from audit_log
      where site_id = ${deps.siteId}
        and (${query.actor ?? null}::uuid is null or actor_user_id = ${query.actor ?? null}::uuid)
        and (${query.action ?? null}::text is null or action = ${query.action ?? null})
        and (${query.entityType ?? null}::text is null or entity_type = ${query.entityType ?? null})
        and (${query.from ?? null}::timestamptz is null or at >= ${query.from ?? null}::timestamptz)
        and (${query.to ?? null}::timestamptz is null or at < ${query.to ?? null}::timestamptz)
        and (${query.override ?? null}::text is null or (after->>'overrideBy' is not null) = ${query.override === "true"})
        and (
          ${query.cursor ?? null}::uuid is null
          or (at, id) < (
            select at, id from audit_log
            where id = ${query.cursor ?? null}::uuid and site_id = ${deps.siteId}
          )
        )
      order by at desc, id desc
      limit ${limit}
    `;
    return {
      entries: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        before: row.before,
        after: row.after,
        at: row.at instanceof Date ? row.at.toISOString() : row.at,
        adminOverride: Boolean(
          row.after &&
          typeof row.after === "object" &&
          "overrideBy" in row.after &&
          row.after.overrideBy,
        ),
      })),
      nextCursor: rows.length === limit ? (rows[rows.length - 1]?.id ?? null) : null,
    };
  });
}

async function sendReport(
  reply: FastifyReply,
  sql: Parameters<typeof buildReport>[0],
  siteId: string,
  kind: string,
  query: {
    from?: string | undefined;
    to?: string | undefined;
    format?: "json" | "csv" | undefined;
    stationKind?: "BAR" | "KITCHEN" | undefined;
  },
): Promise<unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const report = await buildReport(
    sql,
    siteId,
    kind,
    query.from ?? today,
    query.to ?? today,
    query.stationKind,
  );
  if (query.format !== "csv") {
    return report;
  }
  const rows = flatten(report);
  return reply.type("text/csv; charset=utf-8").send(toCsv(rows));
}

function flatten(report: Record<string, unknown>): Record<string, unknown>[] {
  const array = Object.values(report).find((value) => Array.isArray(value));
  if (Array.isArray(array) && array.every((row) => row && typeof row === "object")) {
    return array as Record<string, unknown>[];
  }
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(report)) {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      flat[key] = value;
    }
  }
  return [flat];
}

function actor(request: FastifyRequest): Actor {
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

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) {
      const mapped = domainHttp(error.code);
      throw new AppError(mapped.status, error.code, mapped.message);
    }
    throw error;
  }
}
