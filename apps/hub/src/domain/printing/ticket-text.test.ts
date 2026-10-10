import { ticketPayloadSchema, type TicketPayload } from "@resto/shared";
import { describe, expect, it } from "vitest";

import { decodeTicket, renderTicket } from "./ticket-text.js";

const ticket: TicketPayload = ticketPayloadSchema.parse({
  type: "NEW",
  stationKind: "KITCHEN",
  orderNumber: 12,
  tableLabel: "T3",
  serverName: "Mohamed",
  createdAtIso: "2026-10-10T12:00:00.000Z",
  lines: [{ quantity: 2, nameFr: "Couscous au poisson", note: "sans piment" }],
});

describe("renderTicket", () => {
  it("prints quantities, notes, the Tunis time, and French accents within the width", () => {
    const text = decodeTicket(
      renderTicket(
        { ...ticket, lines: [{ quantity: 1, nameFr: "Café express", note: "serré" }] },
        48,
      ),
    );
    expect(text).toContain("CUISINE");
    expect(text).toContain("1 x Café express");
    expect(text).toContain("  serré");
    expect(text).toContain("13:00");
    expect(text).toContain("Mohamed");
    for (const row of text.split("\n")) {
      expect([...row].length).toBeLessThanOrEqual(48);
    }
  });

  it("marks additions, voids, reprints, and a redirected station", () => {
    expect(decodeTicket(renderTicket({ ...ticket, type: "ADD" }))).toContain("*** AJOUT ***");
    expect(decodeTicket(renderTicket({ ...ticket, type: "VOID" }))).toContain("*** ANNULATION ***");
    expect(decodeTicket(renderTicket({ ...ticket, type: "REPRINT" }))).toContain(
      "*** DUPLICATA ***",
    );
    expect(decodeTicket(renderTicket({ ...ticket, redirectedFrom: "BAR" }))).toContain(
      "DEPUIS BAR",
    );
    expect(decodeTicket(renderTicket({ ...ticket, tableLabel: null }))).toContain("A EMPORTER");
  });
});
