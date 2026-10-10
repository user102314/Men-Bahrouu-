import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import "../../i18n/index.js";
import { MoneyInput } from "./MoneyInput.js";

function Harness() {
  const [value, setValue] = useState("");
  return <MoneyInput id="price" value={value} onChange={setValue} />;
}

describe("MoneyInput", () => {
  it("explains that 1,500 is 1.5 TND and refuses a thousands separator", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("textbox"), "1,500");
    expect(screen.getByText("1,500 signifie 1,5 TND.")).toBeTruthy();
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "1,500.00");
    expect(screen.getByText(/séparateur de milliers/)).toBeTruthy();
  });
});
