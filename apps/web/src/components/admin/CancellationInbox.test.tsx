import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "../../i18n/index.js";
import { CancellationInbox } from "./CancellationInbox.js";

describe("CancellationInbox", () => {
  it("lets an admin accept without an override prompt", async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn();
    render(
      <CancellationInbox rows={[{ id: "c1", orderId: "o1", reason: "erreur de saisie" }]} onDecide={onDecide} />,
    );
    await user.click(screen.getByRole("button", { name: "Accepter" }));
    expect(onDecide).toHaveBeenCalledWith("c1", true);
    expect(screen.queryByText(/Code admin/)).toBeNull();
  });
});
