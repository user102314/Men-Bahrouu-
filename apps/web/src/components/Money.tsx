import { formatMillimes } from "@resto/shared";

import { asMillimes } from "../lib/money-view.js";

export function Money({
  millimes,
  locale,
}: {
  millimes: number;
  locale: "fr" | "ar";
}) {
  return <span className="tabular-nums">{formatMillimes(asMillimes(millimes), locale)}</span>;
}
