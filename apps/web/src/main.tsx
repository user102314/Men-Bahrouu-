import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { applyDocumentLocale, i18n } from "./i18n/index.js";
import "./index.css";

applyDocumentLocale(i18n.language);

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing root");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
