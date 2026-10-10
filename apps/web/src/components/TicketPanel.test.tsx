import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TicketPanel, type TicketLineView } from "./TicketPanel.js";

const labels = {
  decrease: "Diminuer",
  increase: "Augmenter",
  remove: "Retirer",
  note: "Note",
  cancel: "Demander l’annulation",
  locked: "Envoyé",
  pending: "Annulation en attente",
  empty: "Aucun article",
};

const sent: TicketLineView = {
  id: "line-1",
  name: "Café express",
  quantity: 1,
  note: null,
  sent: true,
  sentAt: "2026-10-10T12:00:00.000Z",
  voided: false,
  pendingCancel: false,
};

describe("TicketPanel", () => {
  it("locks a sent line", () => {
    render(
      <TicketPanel
        lines={[sent]}
        disabled={false}
        labels={labels}
        onQuantity={vi.fn()}
        onRemove={vi.fn()}
        onNote={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Diminuer" })).toBeNull();
    expect(screen.getByText(/Envoyé/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Demander l’annulation" })).toBeTruthy();
  });
});
