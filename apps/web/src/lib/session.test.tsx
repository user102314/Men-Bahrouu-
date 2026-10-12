import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { saveSession, useSession, type Session } from "./session.js";

function Probe() {
  const session = useSession();
  return <p>{session?.displayName ?? "none"}</p>;
}

const session: Session = {
  token: "header.payload.sig",
  role: "ADMIN",
  userId: "0199c0a0-0000-7000-8000-000000000010",
  displayName: "Karim",
  expiresAt: Date.now() + 60_000,
};

describe("useSession", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("renders a stored admin session without retriggering", () => {
    saveSession(session);
    render(<Probe />);
    expect(screen.getByText("Karim")).toBeTruthy();
  });
});
