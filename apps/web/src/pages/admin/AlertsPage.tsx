import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ErrorState, PageHeader } from "../../components/admin/widgets.js";
import { adminApi } from "../../lib/admin-api.js";
import { presetRange } from "../../lib/admin/period.js";
import { hubErrorText } from "../../lib/errors.js";

export function AlertsPage() {
  const { t } = useTranslation();
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminApi.settings() });
  const cutoff = settings.data?.businessDayCutoffHour ?? 5;
  const range = presetRange("today", new Date(), cutoff);
  const dashboard = useQuery({
    queryKey: ["admin", "dashboard", range.from, range.to],
    queryFn: () => adminApi.dashboard(range.from, range.to),
  });
  const pending = useQuery({ queryKey: ["cancellations"], queryFn: () => adminApi.cancellations() });
  const jobs = useQuery({ queryKey: ["print-jobs"], queryFn: () => adminApi.printJobs() });
  const failed = jobs.data?.jobs.filter((job) => job.status === "FAILED") ?? [];
  const error = dashboard.error ?? pending.error ?? jobs.error;

  return (
    <div className="grid gap-3">
      <PageHeader title={t("admin.alerts")} />
      {dashboard.data ? <p className="text-sm text-ink/70">{dashboard.data.notice}</p> : null}
      {error ? <ErrorState>{hubErrorText(error, t)}</ErrorState> : null}
      <Link className="rounded-[14px] border border-line bg-surface p-4" to="/admin/products">
        {t("admin.lowStock")}: {dashboard.data?.stockAlerts ?? "…"}
        <span className="ms-2 text-sm text-ink/60">{t("admin.nextLot")}</span>
      </Link>
      <Link className="rounded-[14px] border border-line bg-surface p-4" to="/admin/orders">
        {t("admin.pendingCancel")}: {pending.data?.cancellations.length ?? "…"}
      </Link>
      <Link className="rounded-[14px] border border-line bg-surface p-4" to="/admin/printers">
        {t("admin.printFailed")}: {jobs.data ? failed.length : "…"}
      </Link>
      <article className="rounded-[14px] border border-line bg-surface p-4">
        {t("admin.cashVariance")}: {dashboard.data?.cashVariances ?? "…"}
        <p className="text-sm text-ink/60">{t("admin.nextLot")}</p>
      </article>
    </div>
  );
}
