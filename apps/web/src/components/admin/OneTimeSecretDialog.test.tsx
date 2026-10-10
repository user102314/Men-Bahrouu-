import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "../../i18n/index.js";
import { OneTimeSecretDialog } from "./OneTimeSecretDialog.js";

describe("OneTimeSecretDialog", () => {
  it("shows the token once and offers a copy", () => {
    render(<OneTimeSecretDialog open secret="device-token-once" onClose={() => undefined} />);
    expect(screen.getByText("device-token-once")).toBeTruthy();
    expect(screen.getByText(/n’est affiché qu’une fois/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copier" })).toBeTruthy();
  });
});
