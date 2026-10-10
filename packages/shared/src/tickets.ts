import { z } from "zod";

import { printJobTypeSchema, stationKindSchema } from "./domain/enums.js";

export const ticketLineSchema = z.strictObject({
  quantity: z.number().int().min(1).max(99),
  nameFr: z.string().min(1),
  nameAr: z.string().min(1).optional(),
  note: z.string().min(1).max(120).optional(),
});
export type TicketLine = z.infer<typeof ticketLineSchema>;

/** Frozen preparation ticket. A reprint uses this snapshot unchanged. */
export const ticketPayloadSchema = z.strictObject({
  type: printJobTypeSchema,
  stationKind: stationKindSchema,
  orderNumber: z.number().int().positive(),
  tableLabel: z.string().nullable(),
  serverName: z.string().min(1),
  createdAtIso: z.string().min(1),
  orderNote: z.string().max(200).optional(),
  lines: z.array(ticketLineSchema).min(1),
  redirectedFrom: stationKindSchema.optional(),
});
export type TicketPayload = z.infer<typeof ticketPayloadSchema>;
