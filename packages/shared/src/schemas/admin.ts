import { z } from "zod";

import {
  attendanceSourceSchema,
  baseUnitSchema,
  cashMovementTypeSchema,
  expenseCategorySchema,
  paymentMethodSchema,
  roleSchema,
  stationKindSchema,
} from "../domain/enums.js";

const uuidSchema = z.uuid();
const millimesSchema = z.number().int().nonnegative();
const positiveMillimesSchema = z.number().int().positive();
const baseQtySchema = z.number().int().positive();

export const createCategorySchema = z.strictObject({
  id: uuidSchema,
  nameFr: z.string().trim().min(1).max(80),
  nameAr: z.string().trim().min(1).max(80),
  stationId: uuidSchema,
});
export const updateCategorySchema = createCategorySchema
  .omit({ id: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
export const reorderSchema = z.strictObject({
  ids: z.array(uuidSchema).min(1),
});

export const createProductSchema = z.strictObject({
  id: uuidSchema,
  categoryId: uuidSchema,
  nameFr: z.string().trim().min(1).max(80),
  nameAr: z.string().trim().min(1).max(80),
  priceMillimes: millimesSchema,
  vatRateBp: z.number().int().min(0).max(10_000).optional(),
  confirmHighPrice: z.boolean().optional(),
});
export const updateProductSchema = createProductSchema.omit({ id: true }).partial().extend({
  isActive: z.boolean().optional(),
});
export const availabilitySchema = z.strictObject({ isAvailable: z.boolean() });

export const createTableSchema = z.strictObject({
  id: uuidSchema,
  label: z.string().trim().min(1).max(20),
  zone: z.string().trim().min(1).max(40),
  seats: z.number().int().min(1).max(30),
});
export const updateTableSchema = z.strictObject({
  label: z.string().trim().min(1).max(20).optional(),
  zone: z.string().trim().min(1).max(40).optional(),
  seats: z.number().int().min(1).max(30).optional(),
  isActive: z.boolean().optional(),
});
export const renameZoneSchema = z.strictObject({
  from: z.string().trim().min(1).max(40),
  to: z.string().trim().min(1).max(40),
});

export const createPrinterSchema = z.strictObject({
  id: uuidSchema,
  name: z.string().trim().min(1).max(40),
  host: z.string().trim().min(1).max(80),
  port: z.number().int().min(1).max(65535),
  paperWidthMm: z.number().int().min(58).max(80).optional(),
});
export const updatePrinterSchema = createPrinterSchema.omit({ id: true }).partial().extend({
  isActive: z.boolean().optional(),
});
export const updateStationSchema = z.strictObject({
  printerId: uuidSchema.optional(),
  fallbackStationId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(40).optional(),
});

export const restaurantSettingsSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(3).max(30),
});
export const settingsPutSchema = z
  .strictObject({
    restaurant: restaurantSettingsSchema.optional(),
    defaultVatBp: z.number().int().min(0).max(10_000).optional(),
    businessDayCutoffHour: z.number().int().min(0).max(23).optional(),
    printColumns: z.number().int().min(16).max(64).optional(),
    ticketHeader: z.string().max(80).optional(),
    requireOpenShift: z.boolean().optional(),
    restockOnVoid: z.boolean().optional(),
    cashVarianceAlertMillimes: millimesSchema.optional(),
    priceCeilingMillimes: positiveMillimesSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one setting is required",
  });

export const createUserSchema = z.strictObject({
  id: uuidSchema,
  displayName: z.string().trim().min(1).max(60),
  role: roleSchema,
  email: z.email().optional(),
  password: z.string().min(8).optional(),
});
export const updateUserSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(60).optional(),
  email: z.email().optional(),
});
export const changeRoleSchema = z.strictObject({
  role: roleSchema,
  email: z.email().optional(),
  password: z.string().min(8).optional(),
});

export const attendanceRangeSchema = z.strictObject({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  userId: uuidSchema.optional(),
});
export const editAttendanceSchema = z.strictObject({
  clockIn: z.iso.datetime().optional(),
  clockOut: z.iso.datetime().nullable().optional(),
  reason: z.string().trim().min(3).max(200),
  source: attendanceSourceSchema.optional(),
});

export const staffShiftSlotSchema = z.strictObject({
  userId: uuidSchema,
  workDate: z.iso.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  note: z.string().max(120).optional(),
});
export const putStaffShiftsSchema = z.strictObject({
  weekStart: z.iso.date(),
  slots: z.array(staffShiftSlotSchema),
});

export const createStockItemSchema = z.strictObject({
  id: uuidSchema,
  code: z.string().trim().min(1).max(40),
  nameFr: z.string().trim().min(1).max(80),
  nameAr: z.string().trim().max(80).optional(),
  baseUnit: baseUnitSchema,
  minThresholdBase: z.number().int().nonnegative(),
  supplierId: uuidSchema.optional(),
});
export const updateStockItemSchema = createStockItemSchema
  .omit({ id: true, baseUnit: true })
  .partial()
  .extend({
    isActive: z.boolean().optional(),
  });
export const recipeSchema = z.strictObject({
  ingredients: z.array(
    z.strictObject({
      stockItemId: uuidSchema,
      quantityBase: baseQtySchema,
    }),
  ),
});
export const manualMovementSchema = z.strictObject({
  stockItemId: uuidSchema,
  deltaBase: z
    .number()
    .int()
    .refine((value) => value !== 0, { message: "Delta must not be zero" }),
  reason: z.enum(["WASTE", "CORRECTION"]),
  note: z.string().trim().min(3).max(200),
});
export const inventorySchema = z.strictObject({
  note: z.string().max(200).optional(),
  lines: z
    .array(
      z.strictObject({
        stockItemId: uuidSchema,
        countedBase: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export const supplierSchema = z.strictObject({
  id: uuidSchema,
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
  note: z.string().max(200).optional(),
});
export const updateSupplierSchema = supplierSchema.omit({ id: true }).partial().extend({
  isActive: z.boolean().optional(),
});
export const purchaseLineSchema = z.strictObject({
  stockItemId: uuidSchema,
  quantityBase: baseQtySchema,
  totalCostMillimes: millimesSchema,
});
export const createPurchaseSchema = z.strictObject({
  id: uuidSchema,
  supplierId: uuidSchema,
  invoiceRef: z.string().trim().max(40).optional(),
  purchaseDate: z.iso.date(),
  lines: z.array(purchaseLineSchema).min(1),
});
export const updatePurchaseSchema = createPurchaseSchema.omit({ id: true }).partial();

export const expenseSchema = z.strictObject({
  id: uuidSchema,
  category: expenseCategorySchema,
  amountMillimes: positiveMillimesSchema,
  expenseDate: z.iso.date(),
  note: z.string().max(200).optional(),
  supplierId: uuidSchema.optional(),
  payFromShiftId: uuidSchema.optional(),
});
export const updateExpenseSchema = z.strictObject({
  note: z.string().max(200).optional(),
  isVoid: z.boolean().optional(),
});

export const openShiftSchema = z.strictObject({
  id: uuidSchema,
  openingFloatMillimes: millimesSchema,
});
export const cashMovementSchema = z.strictObject({
  type: cashMovementTypeSchema,
  amountMillimes: positiveMillimesSchema,
  reason: z.string().trim().min(3).max(200),
  expenseId: uuidSchema.optional(),
});
export const closeShiftSchema = z.strictObject({
  countedMillimes: millimesSchema,
  note: z.string().max(200).optional(),
});
export const shiftNoteSchema = z.strictObject({ note: z.string().max(200) });

export const createPaymentSchema = z.strictObject({
  method: paymentMethodSchema,
  tenderedMillimes: millimesSchema.optional(),
});

export const reportQuerySchema = z.strictObject({
  from: z.iso.date(),
  to: z.iso.date(),
  format: z.enum(["json", "csv"]).optional(),
  stationKind: stationKindSchema.optional(),
});
export const auditQuerySchema = z.strictObject({
  actor: uuidSchema.optional(),
  action: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.string().min(1).optional(),
  override: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
