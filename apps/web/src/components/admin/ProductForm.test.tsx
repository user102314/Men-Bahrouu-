import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "../../i18n/index.js";
import { ProductForm } from "./ProductForm.js";

describe("ProductForm", () => {
  it("submits a catalogue product with an integer price", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    render(
      <ProductForm
        categories={[
          {
            id: "0199c0a0-0000-7000-8000-0000000000aa",
            nameFr: "Boissons",
            nameAr: "مشروبات",
            stationId: "0199c0a0-0000-7000-8000-0000000000bb",
            stationKind: "BAR",
            isActive: true,
            sortOrder: 0,
          },
        ]}
        ceilingMillimes={1_000_000}
        onCreate={onCreate}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "Nom français" }), "Thé");
    await user.type(screen.getByRole("textbox", { name: "Nom arabe" }), "شاي");
    await user.type(screen.getByRole("textbox", { name: "Prix" }), "2");
    await user.click(screen.getByRole("button", { name: "Créer" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0].priceMillimes).toBe(2_000);
  });
});
