import { can, formatMillimes, millimes } from "@resto/shared";

export const sharedReady =
  can("ADMIN", "settings.edit") && formatMillimes(millimes(12_500), "fr") === "12,500 TND";
