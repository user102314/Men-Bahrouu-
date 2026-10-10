import type { TFunction } from "i18next";

import { HubError } from "./api.js";

export function hubErrorText(error: unknown, t: TFunction): string {
  if (!(error instanceof HubError)) {
    return t("errors.unknown");
  }
  if (error.code === "AUTH_LOCKED") {
    return t("errors.AUTH_LOCKED", { seconds: error.retryAfterSeconds ?? 0 });
  }
  const key = `errors.${error.code}`;
  const translated = t(key);
  return translated === key ? t("errors.unknown") : translated;
}
