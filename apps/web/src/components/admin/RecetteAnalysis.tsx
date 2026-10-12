import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Money } from "../Money.js";
import {
  analyzeProducts,
  formatBasisPoints,
  type AnalysisLine,
  type StationFilter,
} from "../../lib/admin/recette-analysis.js";

const FILTERS: StationFilter[] = ["ALL", "BAR", "KITCHEN"];

export function RecetteAnalysis({
  day,
  lines,
  locale,
}: {
  day: string;
  lines: AnalysisLine[];
  locale: "ar" | "fr";
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<StationFilter>("ALL");
  const view = analyzeProducts(lines, filter);
  const labels: Record<StationFilter, string> = {
    ALL: t("admin.recetteFilterAll"),
    BAR: t("admin.recetteFilterBar"),
    KITCHEN: t("admin.recetteFilterKitchen"),
  };

  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-xl">
          {t("admin.recetteAnalysis")} · {day}
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`min-h-11 rounded-[12px] border px-3 text-sm ${
              item === filter ? "border-primary bg-primary text-white" : "border-line bg-surface"
            }`}
            onClick={() => setFilter(item)}
          >
            {labels[item]}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {view.topBar ? (
          <Highlight
            label={`${t("admin.recetteTopSold")} · ${t("admin.recetteFilterBar")}`}
            name={view.topBar.name}
            quantity={view.topBar.soldQuantity}
            millimes={view.topBar.revenueMillimes}
            locale={locale}
            quantityLabel={t("admin.qty")}
          />
        ) : null}
        {view.topKitchen ? (
          <Highlight
            label={`${t("admin.recetteTopSold")} · ${t("admin.recetteFilterKitchen")}`}
            name={view.topKitchen.name}
            quantity={view.topKitchen.soldQuantity}
            millimes={view.topKitchen.revenueMillimes}
            locale={locale}
            quantityLabel={t("admin.qty")}
          />
        ) : null}
        <article className="rounded-[14px] border border-line bg-surface p-3">
          <p className="text-sm text-ink/70">{t("admin.recetteVoidRate")}</p>
          <p className="font-display text-2xl">{formatBasisPoints(view.voidRateBp)}</p>
        </article>
        <article className="rounded-[14px] border border-line bg-surface p-3">
          <p className="text-sm text-ink/70">{t("admin.recetteKnownMargin")}</p>
          <p className="font-display text-2xl">
            {view.rows.length > 0 && view.missingRecipeCount === view.rows.length ? (
              t("admin.recetteNoRecipe")
            ) : (
              <Money millimes={view.knownMarginMillimes} locale={locale} />
            )}
          </p>
        </article>
      </div>
      <p className="text-sm text-ink/70">{t("admin.recetteMarginNote")}</p>
      {view.rows.length === 0 ? <p className="text-sm">{t("admin.recetteEmpty")}</p> : null}
      <ul className="grid gap-2">
        {view.rows.map((row) => {
          const leader =
            (view.topBar?.productId === row.productId && view.topBar.name === row.name) ||
            (view.topKitchen?.productId === row.productId && view.topKitchen.name === row.name);
          return (
            <li
              key={`${row.productId}-${row.name}`}
              className="grid gap-2 rounded-[14px] border border-line bg-surface p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium break-words">
                  {row.name}
                  {leader ? (
                    <span className="ms-2 text-sm text-primary">{t("admin.recetteTopSold")}</span>
                  ) : null}
                </p>
                <p className="text-sm text-ink/70">{labels[row.kind]}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {t("admin.qty")} {row.soldQuantity}
                </span>
                <Money millimes={row.revenueMillimes} locale={locale} />
              </div>
              <Meter label={t("admin.recetteShare")} basisPoints={row.revenueShareBp} />
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
                <span>
                  {t("admin.recetteVoidRate")} {formatBasisPoints(row.voidRateBp)}
                </span>
                <span>
                  {t("admin.recetteMargin")}{" "}
                  {row.marginMillimes === null ? (
                    t("admin.recetteNoRecipe")
                  ) : (
                    <Money millimes={row.marginMillimes} locale={locale} />
                  )}
                </span>
                <span>
                  {t("admin.recetteMarginShare")}{" "}
                  {row.marginShareBp === null ? "—" : formatBasisPoints(row.marginShareBp)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Highlight({
  label,
  name,
  quantity,
  millimes,
  locale,
  quantityLabel,
}: {
  label: string;
  name: string;
  quantity: number;
  millimes: number;
  locale: "ar" | "fr";
  quantityLabel: string;
}) {
  return (
    <article className="rounded-[14px] border border-line bg-surface p-3">
      <p className="text-sm text-ink/70">{label}</p>
      <p className="font-display text-xl break-words">{name}</p>
      <p className="text-sm">
        {quantityLabel} {quantity} · <Money millimes={millimes} locale={locale} />
      </p>
    </article>
  );
}

function Meter({ label, basisPoints }: { label: string; basisPoints: number }) {
  const width = Math.min(100, Math.max(0, basisPoints / 100));
  return (
    <div className="grid gap-1">
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span>{formatBasisPoints(basisPoints)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-fond">
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
