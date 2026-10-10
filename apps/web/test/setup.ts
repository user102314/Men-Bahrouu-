import { cleanup } from "@testing-library/react";
import i18n from "i18next";
import { afterEach, beforeEach } from "vitest";

import "../src/i18n/index.js";

beforeEach(async () => {
  await i18n.changeLanguage("fr");
});

afterEach(() => {
  cleanup();
});
