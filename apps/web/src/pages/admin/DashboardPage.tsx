import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { DateRangePicker } from "../../components/admin/DateRangePicker.js";
import { MillimeBars } from "../../components/admin/MillimeBars.js";
import { ChartCard, DataTable, EmptyState, ErrorState, KpiCard, PageHeader } from "../../components/admin/widgets.js";
import { Money } from "../../components/Money.js";
import { adminApi } from "../../lib/admin-api.js";
import { presetRange, type DateRange, type PeriodPreset } from "../../lib/admin/period.js";
import { hubErrorText } from "../../lib/errors.js";

function signed(current: number, previous: number): string {
  const delta = current - previous;
  return delta > 0 ? `+${delta}` : String(delta);
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminApi.settings() });
  const cutoff = settings.data?.businessDayCutoffHour ?? 5;
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [range, setRange] = useState<DateRange>(() => presetRange("today", new Date(), 5));

  useEffect(() => {
    if (preset !== "custom") {
      setRange(presetRange(preset, new Date(), cutoff));
    }
  }, [preset, cutoff]);

  const dashboard = useQuery({
    queryKey: ["admin", "dashboard", range.from, range.to],
    queryFn: () => adminApi.dashboard(range.from, range.to),
  });
  const hours = useQuery({
    queryKey: ["admin", "by-hour", range.from, range.to],
    queryFn: () => adminApi.byHour(range.from, range.to),
  });
  const days = useQuery({
    queryKey: ["admin", "by-day", range.from, range.to],
    queryFn: () => adminApi.byDay(range.from, range.to),
  });
  const top = useQuery({
    queryKey: ["admin", "top", range.from, range.to],
    queryFn: () => adminApi.topProducts(range.from, range.to),
  });
  const payments = useQuery({
    queryKey: ["admin", "payments", range.from, range.to],
    queryFn: () => adminApi.payments(range.from, range.to),
  });
  const stations = useQuery({
    queryKey: ["admin", "stations", range.from, range.to],
    queryFn: () => adminApi.stations(range.from, range.to),
  });
  const shifts = useQuery({ queryKey: ["admin", "shifts"], queryFn: () => adminApi.openShifts() });
  const orders = useQuery({ queryKey: ["admin", "orders", "open"], queryFn: () => adminApi.orders() });
  const inProgress =
    orders.data?.orders.filter((order) => order.status === "DRAFT" || order.status === "SENT" || order.status === "SERVED")
      .length ?? 0;

  const report = dashboard.data;
  const failed = dashboard.error ?? hours.error ?? days.error;

  return (
    <div className="grid gap-4">
      <PageHeader title={t("admin.dashboard")}>
        <DateRangePicker preset={preset} range={range} onPreset={setPreset} onRange={setRange} />
      </PageHeader>
      {report ? <p className="text-sm text-ink/70">{report.notice}</p> : null}
      {failed ? <ErrorState>{hubErrorText(failed, t)}</ErrorState> : null}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-surface px-3 py-2">
          {shifts.data && shifts.data.shifts.length > 0
            ? t("admin.openShift", { count: shifts.data.shifts.length })
            : t("admin.noShift")}
        </span>
        <span className="rounded-full bg-surface px-3 py-2">
          {t("admin.inProgress", { count: inProgress })}
          {orders.data?.nextCursor ? "+" : ""}
        </span>
      </div>
      {report ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={t("admin.revenue")}
            value={<Money millimes={report.revenueMillimes} locale={locale} />}
            detail={signed(report.revenueMillimes, report.previous.revenueMillimes)}
          />
          <KpiCard
            label={t("admin.ordersCount")}
            value={report.orderCount}
            detail={signed(report.orderCount, report.previous.orderCount)}
          />
          <KpiCard
            label={t("admin.basket")}
            value={<Money millimes={report.averageBasketMillimes} locale={locale} />}
            detail={signed(report.averageBasketMillimes, report.previous.averageBasketMillimes)}
          />
          <KpiCard
            label={t("admin.voids")}
            value={report.voidCount}
            detail={<Money millimes={report.voidValueMillimes} locale={locale} />}
          />
        </div>
      ) : null}
      <p className="text-sm text-ink/70">
        {t("admin.covers")}: {report?.covers ?? t("admin.unknownCovers")}
      </p>
      <section className="grid gap-2 rounded-[14px] border border-line bg-surface p-4">
        <h2 className="font-display text-xl">{t("admin.alerts")}</h2>
        <Link className="min-h-12" to="/admin/alerts">
          {t("admin.lowStock")}: {report?.stockAlerts ?? "…"}
        </Link>
        <Link className="min-h-12" to="/admin/alerts">
          {t("admin.cashVariance")}: {report?.cashVariances ?? "…"}
        </Link>
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title={t("admin.byHour")}>
          {hours.data && hours.data.points.length > 0 ? (
            <MillimeBars
              rows={hours.data.points.map((point) => ({
                label: String(point.hour),
                revenue_millimes: point.revenue_millimes,
              }))}
            />
          ) : (
            <EmptyState>{t("admin.empty")}</EmptyState>
          )}
        </ChartCard>
        <ChartCard title={t("admin.byDay")}>
          {days.data && days.data.points.length > 0 ? (
            <MillimeBars
              rows={days.data.points.map((point) => ({ label: point.day, revenue_millimes: point.revenue_millimes }))}
            />
          ) : (
            <EmptyState>{t("admin.empty")}</EmptyState>
          )}
        </ChartCard>
      </div>
      <ChartCard title={t("admin.top")}>
        {top.data && top.data.products.length > 0 ? (
          <DataTable>
            <tbody>
              {top.data.products.map((product) => (
                <tr key={product.name} className="border-t border-line">
                  <td className="p-3">{product.name}</td>
                  <td className="p-3">{product.quantity}</td>
                  <td className="p-3">
                    <Money millimes={product.revenue_millimes} locale={locale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState>{t("admin.empty")}</EmptyState>
        )}
      </ChartCard>
      <div className="grid gap-3 md:grid-cols-2">
        <ChartCard title={t("admin.payments")}>
          {payments.data && payments.data.methods.length > 0 ? (
            <ul>
              {payments.data.methods.map((method) => (
                <li key={method.method} className="flex min-h-12 items-center justify-between">
                  <span>{t(`cashier.${method.method === "MEAL_VOUCHER" ? "voucher" : method.method.toLowerCase()}`, method.method)}</span>
                  <Money millimes={method.amount_millimes} locale={locale} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>{t("admin.empty")}</EmptyState>
          )}
        </ChartCard>
        <ChartCard title={t("admin.stations")}>
          {stations.data && stations.data.stations.length > 0 ? (
            <ul>
              {stations.data.stations.map((station) => (
                <li key={station.kind} className="flex min-h-12 items-center justify-between">
                  <span>{t(`status.${station.kind}`)}</span>
                  <Money millimes={station.revenue_millimes} locale={locale} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>{t("admin.empty")}</EmptyState>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
