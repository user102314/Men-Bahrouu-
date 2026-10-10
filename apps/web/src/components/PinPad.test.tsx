import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PinPad } from "./PinPad.js";

function Harness({ onSubmit, error = false }: { onSubmit: () => void; error?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <PinPad
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      error={error}
      submitLabel="Entrer"
      backspaceLabel="Effacer un chiffre"
    />
  );
}

describe("PinPad", () => {
  it("masks the digits and submits four to six of them", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    for (const digit of ["1", "2", "3", "4"]) {
      await user.click(screen.getByRole("button", { name: digit }));
    }
    expect(screen.getByTestId("pin-dots").textContent).toBe("••••");
    expect(screen.queryByText("1234")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Entrer" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("shakes when the code is rejected", () => {
    render(<Harness onSubmit={vi.fn()} error />);
    expect(screen.getByTestId("pin-dots").className).toContain("shake");
  });
});
