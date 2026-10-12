import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { DateRangePicker } from "../../components/admin/DateRangePicker.js";
import { RecetteAnalysis } from "../../components/admin/RecetteAnalysis.js";
import { EmptyState, ErrorState, PageHeader } from "../../components/admin/widgets.js";
import { Money } from "../../components/Money.js";
import { adminApi } from "../../lib/admin-api.js";
import { presetRange, type DateRange, type PeriodPreset } from "../../lib/admin/period.js";
import { hubErrorText } from "../../lib/errors.js";

export function RecettesPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => adminApi.settings(),
  });
  const cutoff = settings.data?.businessDayCutoffHour ?? 5;
  const [preset, setPreset] = useState<PeriodPreset>("7");
  const [range, setRange] = useState<DateRange>(() => presetRange("7", new Date(), 5));
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    if (preset !== "custom") {
      setRange(presetRange(preset, new Date(), cutoff));
    }
  }, [preset, cutoff]);

  const days = useQuery({
    queryKey: ["admin", "by-day", range.from, range.to],
    queryFn: () => adminApi.byDay(range.from, range.to),
  });
  const selected =
    day && days.data?.points.some((point) => point.day === day)
      ? day
      : (days.data?.points.at(-1)?.day ?? null);

  const analysis = useQuery({
    queryKey: ["admin", "recette-analysis", selected],
    queryFn: () => adminApi.productAnalysis(selected ?? "", selected ?? ""),
    enabled: selected !== null,
  });
  const payments = useQuery({
    queryKey: ["admin", "recette-payments", selected],
    queryFn: () => adminApi.payments(selected ?? "", selected ?? ""),
    enabled: selected !== null,
  });
  const stations = useQuery({
    queryKey: ["admin", "recette-stations", selected],
    queryFn: () => adminApi.stations(selected ?? "", selected ?? ""),
    enabled: selected !== null,
  });
  const voids = useQuery({
    queryKey: ["admin", "recette-voids", selected],
    queryFn: () => adminApi.voids(selected ?? "", selected ?? ""),
    enabled: selected !== null,
  });
  const close = useQuery({
    queryKey: ["admin", "recette-close", selected],
    queryFn: () => adminApi.dailyClose(selected ?? "", selected ?? ""),
    enabled: selected !== null,
  });
  const error =
    days.error ?? analysis.error ?? payments.error ?? stations.error ?? voids.error ?? close.error;

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("admin.recetteTitle")}>
        <DateRangePicker preset={preset} range={range} onPreset={setPreset} onRange={setRange} />
      </PageHeader>
      <p className="text-sm text-ink/70">{t("admin.recetteHelp")}</p>
      {error ? <ErrorState>{hubErrorText(error, t)}</ErrorState> : null}
      {days.data && days.data.points.length === 0 ? (
        <EmptyState>{t("admin.recetteEmpty")}</EmptyState>
      ) : null}
      {days.data && days.data.points.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {days.data.points.map((point) => (
            <button
              key={point.day}
              type="button"
              className={`min-h-11 rounded-[12px] border px-3 text-start text-sm ${
                point.day === selected
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-surface"
              }`}
              onClick={() => setDay(point.day)}
            >
              <span className="block font-medium">{point.day}</span>
              <Money millimes={point.revenue_millimes} locale={locale} />
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {analysis.data ? (
            <RecetteAnalysis day={selected} lines={analysis.data.products} locale={locale} />
          ) : null}
          {analysis.isPending ? <p className="text-sm">{t("common.loading")}</p> : null}
          <div className="grid min-w-0 content-start gap-4">
            <section className="grid gap-2">
              <h2 className="font-display text-xl">{t("admin.recettePayments")}</h2>
              {(payments.data?.methods ?? []).map((method) => (
                <p
                  key={method.method}
                  className="flex flex-wrap justify-between gap-2 rounded-[12px] border border-line bg-surface px-3 py-2"
                >
                  <span>
                    {t(
                      `cashier.${method.method === "MEAL_VOUCHER" ? "voucher" : method.method.toLowerCase()}`,
                      method.method,
                    )}{" "}
                    · {method.count}
                  </span>
                  <Money millimes={method.amount_millimes} locale={locale} />
                </p>
              ))}
              {close.data ? (
                <p className="text-sm text-ink/70">
                  {t("admin.recetteVat")} ·{" "}
                  <Money millimes={close.data.vatMillimes} locale={locale} />
                </p>
              ) : null}
            </section>
            <section className="grid gap-2">
              <h2 className="font-display text-xl">{t("admin.recetteStations")}</h2>
              {(stations.data?.stations ?? []).map((station) => (
                <p
                  key={station.kind}
                  className="flex flex-wrap justify-between gap-2 rounded-[12px] border border-line bg-surface px-3 py-2"
                >
                  <span>
                    {t(`status.${station.kind}`)} · {t("admin.qty")} {station.quantity}
                  </span>
                  <Money millimes={station.revenue_millimes} locale={locale} />
                </p>
              ))}
            </section>
            <section className="grid gap-2">
              <h2 className="font-display text-xl">{t("admin.recetteVoids")}</h2>
              {close.data ? (
                <p className="text-sm">
                  {close.data.voidCount} ·{" "}
                  <Money millimes={close.data.voidValueMillimes} locale={locale} />
                </p>
              ) : null}
              {(voids.data?.voids ?? []).map((row) => (
                <p
                  key={row.id}
                  className="rounded-[12px] border border-line bg-surface px-3 py-2 text-sm break-words"
                >
                  {row.business_date} · {row.reason}
                </p>
              ))}
            </section>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink/70">{t("admin.recettePick")}</p>
      )}
    </div>
  );
}
