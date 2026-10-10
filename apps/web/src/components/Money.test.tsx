import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "./Money.js";

describe("Money", () => {
  it("shows latin millimes with the locale suffix", () => {
    render(<Money millimes={12_500} locale="fr" />);
    expect(screen.getByText("12,500 TND")).toBeTruthy();
  });
});
