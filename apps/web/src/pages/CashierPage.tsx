import { tndToMillimes, type PaymentMethod, type PublicOrder } from "@resto/shared";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Money } from "../components/Money.js";
import { useLink } from "../components/HubLink.js";
import { Button } from "../components/ui/button.js";
import { Dialog } from "../components/ui/dialog.js";
import {
  api,
  type Catalog,
  type PrintJob,
} from "../lib/api.js";
import { hubErrorText } from "../lib/errors.js";
import { CASH_SHORTCUTS_MILLIMES, changeDue } from "../lib/money-view.js";
import { queryClient } from "../lib/query.js";
import { tunisTime } from "../lib/time.js";

function stationIds(catalog: Catalog | undefined, order: PublicOrder, kind: "BAR" | "KITCHEN"): string[] {
  const ids = new Set<string>();
  for (const item of order.items) {
    const category = catalog?.categories.find((entry) => entry.stationId === item.stationId);
    if (category?.stationKind === kind) {
      ids.add(item.stationId);
    }
  }
  return [...ids];
}

function jobLabel(job: PrintJob): string {
  if (job.payload && typeof job.payload === "object" && "stationKind" in job.payload) {
    const kind = job.payload.stationKind;
    if (kind === "BAR" || kind === "KITCHEN") {
      return kind;
    }
  }
  return job.type;
}

export function CashierPage() {
  const { t, i18n } = useTranslation();
  const link = useLink();
  const blocked = link === "unreachable";
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => api.orders(), refetchInterval: 4000 });
  const tables = useQuery({ queryKey: ["tables"], queryFn: api.tables });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: api.catalog });
  const inbox = useQuery({
    queryKey: ["cancellations"],
    queryFn: api.cancellations,
    refetchInterval: 4000,
  });
  const jobs = useQuery({ queryKey: ["print-jobs"], queryFn: api.printJobs, refetchInterval: 4000 });
  const printers = useQuery({ queryKey: ["printers"], queryFn: api.printers, refetchInterval: 10_000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["order", selectedId],
    queryFn: () => api.order(selectedId ?? ""),
    enabled: Boolean(selectedId),
  });
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [tenderedText, setTenderedText] = useState("");
  const [paid, setPaid] = useState<{ change: number | null; notice: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toPay = new Set(
    (tables.data?.tables ?? [])
      .filter((table) => table.status === "TO_PAY" && table.openOrderId)
      .map((table) => table.openOrderId),
  );
  const openOrders = (orders.data?.orders ?? []).filter(
    (order) => order.status === "DRAFT" || order.status === "SENT" || order.status === "SERVED",
  );
  const columns = {
    progress: openOrders.filter((order) => order.status !== "SERVED" && !toPay.has(order.id)),
    served: openOrders.filter((order) => order.status === "SERVED" && !toPay.has(order.id)),
    topay: openOrders.filter((order) => toPay.has(order.id)),
  };
  const order = detail.data?.order ?? null;
  let tendered = 0;
  let tenderedOk = true;
  try {
    tendered = tenderedText.trim().length === 0 ? 0 : tndToMillimes(tenderedText);
  } catch {
    tenderedOk = false;
  }
  const change = order ? changeDue(order.totalMillimes, tendered) : 0;
  const failed = (jobs.data?.jobs ?? []).filter((job) => job.status === "FAILED");

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(hubErrorText(error, t));
    } finally {
      setBusy(false);
    }
  }

  function tableLabel(tableId: string | null): string {
    return tables.data?.tables.find((table) => table.id === tableId)?.label ?? t("waiter.takeaway");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-4">
        {message ? <p role="alert">{message}</p> : null}
        {failed.length > 0 ? (
          <p className="rounded-[14px] bg-terracotta px-4 py-3 text-white" role="alert">
            {t("cashier.failed")} ({failed.length})
          </p>
        ) : null}
        <section className="grid gap-3">
          <h2 className="text-2xl">{t("waiter.floor")}</h2>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6 xl:grid-cols-8">
            {(tables.data?.tables ?? [])
              .filter((table) => table.isActive !== false)
              .sort((left, right) => left.label.localeCompare(right.label, "fr", { numeric: true }))
              .map((table) => (
                <button
                  key={table.id}
                  type="button"
                  className="min-h-16 rounded-[14px] border border-line bg-surface p-2 text-start"
                  onClick={() => {
                    if (table.openOrderId) {
                      setSelectedId(table.openOrderId);
                    }
                  }}
                >
                  <span className="block text-lg">{table.label}</span>
                  <span className="text-sm">{t(`status.${table.status}`)}</span>
                </button>
              ))}
          </div>
        </section>
        <div className="grid gap-4 lg:grid-cols-3">
          {(["progress", "served", "topay"] as const).map((column) => (
            <section key={column} className="grid content-start gap-3">
              <h2 className="text-2xl">
                {t(`cashier.${column}`)} ({columns[column].length})
              </h2>
              {columns[column].map((item) => (
                <motion.button
                  layout
                  type="button"
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[14px] border border-line bg-surface p-3 text-start"
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xl">{tableLabel(item.tableId)}</span>
                    <Money millimes={item.totalMillimes} locale={locale} />
                  </span>
                  <span className="mt-1 block text-sm">
                    {item.serverName} · {tunisTime(item.openedAt)}
                  </span>
                  <span className="mt-2 flex gap-2 text-sm">
                    {item.items.some((line) => {
                      const category = catalog.data?.categories.find((entry) => entry.stationId === line.stationId);
                      return category?.stationKind === "BAR" && line.status === "ACTIVE";
                    }) ? (
                      <span className="text-bar">{t("status.BAR")}</span>
                    ) : null}
                    {item.items.some((line) => {
                      const category = catalog.data?.categories.find((entry) => entry.stationId === line.stationId);
                      return category?.stationKind === "KITCHEN" && line.status === "ACTIVE";
                    }) ? (
                      <span className="text-terracotta">{t("status.KITCHEN")}</span>
                    ) : null}
                  </span>
                </motion.button>
              ))}
            </section>
          ))}
        </div>
        <section className="grid gap-3 rounded-[14px] border border-line bg-surface p-4">
          <h2 className="text-2xl">
            {t("cashier.inbox")} ({inbox.data?.cancellations.length ?? 0})
          </h2>
          {(inbox.data?.cancellations ?? []).length === 0 ? <p>{t("cashier.empty")}</p> : null}
          {(inbox.data?.cancellations ?? []).map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2">
              <p className="me-auto">
                {item.reason}
              </p>
              <Button
                disabled={blocked || busy}
                onClick={() =>
                  void run(async () => {
                    await api.decideCancellation(item.id, false);
                    void queryClient.invalidateQueries({ queryKey: ["cancellations"] });
                    void queryClient.invalidateQueries({ queryKey: ["orders"] });
                  })
                }
              >
                {t("cashier.refuse")}
              </Button>
              <Button
                intent="primary"
                disabled={blocked || busy}
                onClick={() =>
                  void run(async () => {
                    await api.decideCancellation(item.id, true);
                    void queryClient.invalidateQueries({ queryKey: ["cancellations"] });
                    void queryClient.invalidateQueries({ queryKey: ["orders"] });
                  })
                }
              >
                {t("cashier.approve")}
              </Button>
            </div>
          ))}
        </section>
      </div>
      <aside className="grid content-start gap-4">
        <section className="grid gap-3 rounded-[14px] border border-line bg-surface p-4">
          <h2 className="text-2xl">{t("cashier.detail")}</h2>
          {!order ? <p>{t("cashier.empty")}</p> : null}
          {order ? (
            <>
              <p>
                {tableLabel(order.tableId)} · {order.serverName} · {t(`status.${order.status}`)}
              </p>
              <ul className="grid gap-2">
                {order.items.map((item) => (
                  <li key={item.id} className={item.status === "VOIDED" ? "line-through opacity-60" : ""}>
                    {item.quantity} × {item.productNameSnapshot}
                    {item.note ? ` · ${item.note}` : ""}
                  </li>
                ))}
              </ul>
              <p>
                <Money millimes={order.totalMillimes} locale={locale} />
              </p>
              <h3 className="text-lg">{t("cashier.history")}</h3>
              <ul className="grid gap-1 text-sm">
                {(detail.data?.cancellations ?? []).map((item) => (
                  <li key={item.id}>
                    {t(`status.${item.status}`)} · {item.reason}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={blocked || busy || order.status !== "SENT"}
                  onClick={() =>
                    void run(async () => {
                      await api.markServed(order.id);
                      void queryClient.invalidateQueries({ queryKey: ["order", order.id] });
                      void queryClient.invalidateQueries({ queryKey: ["orders"] });
                    })
                  }
                >
                  {t("cashier.servedAction")}
                </Button>
                <Button
                  disabled={blocked || busy}
                  onClick={() =>
                    void run(async () => {
                      await api.reprint(order.id);
                    })
                  }
                >
                  {t("cashier.reprintBoth")}
                </Button>
                <Button
                  disabled={blocked || busy}
                  onClick={() =>
                    void run(async () => {
                      for (const stationId of stationIds(catalog.data, order, "BAR")) {
                        await api.reprint(order.id, stationId);
                      }
                    })
                  }
                >
                  {t("cashier.reprintBar")}
                </Button>
                <Button
                  disabled={blocked || busy}
                  onClick={() =>
                    void run(async () => {
                      for (const stationId of stationIds(catalog.data, order, "KITCHEN")) {
                        await api.reprint(order.id, stationId);
                      }
                    })
                  }
                >
                  {t("cashier.reprintKitchen")}
                </Button>
                <Button
                  intent="primary"
                  disabled={blocked || busy || (order.status !== "SENT" && order.status !== "SERVED")}
                  onClick={() => {
                    setPaid(null);
                    setPayOpen(true);
                  }}
                >
                  {t("cashier.pay")}
                </Button>
              </div>
            </>
          ) : null}
        </section>
        <section className="grid gap-3 rounded-[14px] border border-line bg-surface p-4">
          <h2 className="text-2xl">{t("cashier.prints")}</h2>
          <ul className="grid gap-2">
            {(printers.data?.printers ?? []).map((printer) => (
              <li key={printer.id}>
                {printer.name} · {printer.online ? t("cashier.online") : t("cashier.offline")}
              </li>
            ))}
          </ul>
          <ul className="grid gap-2">
            {(jobs.data?.jobs ?? [])
              .slice(-12)
              .reverse()
              .map((job) => (
                <li
                  key={job.id}
                  className={`flex flex-wrap items-center gap-2 rounded-[12px] border px-3 py-2 ${job.status === "FAILED" ? "border-terracotta" : "border-line"}`}
                >
                  <span>
                    {t(`status.${jobLabel(job)}`, { defaultValue: jobLabel(job) })} ·{" "}
                    {t(`status.${job.status}`, { defaultValue: job.status })}
                  </span>
                  {job.status === "FAILED" ? (
                    <Button
                      className="ms-auto"
                      disabled={blocked || busy}
                      onClick={() =>
                        void run(async () => {
                          await api.retryPrint(job.id);
                          void queryClient.invalidateQueries({ queryKey: ["print-jobs"] });
                        })
                      }
                    >
                      {t("common.retry")}
                    </Button>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      </aside>
      <Dialog open={payOpen} onOpenChange={setPayOpen} title={t("cashier.pay")}>
        <p className="text-sm">{t("cashier.notice")}</p>
        {order ? (
          <p className="mt-2 text-2xl">
            <Money millimes={order.totalMillimes} locale={locale} />
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["CASH", "CARD", "MEAL_VOUCHER"] as const).map((item) => (
            <Button key={item} intent={method === item ? "primary" : "quiet"} onClick={() => setMethod(item)}>
              {t(item === "CASH" ? "cashier.cash" : item === "CARD" ? "cashier.card" : "cashier.voucher")}
            </Button>
          ))}
        </div>
        {method === "CASH" ? (
          <div className="mt-3 grid gap-2">
            <label className="grid gap-2">
              {t("cashier.tendered")}
              <input
                className="min-h-14 rounded-[12px] border border-line bg-fond px-3 text-2xl tabular-nums"
                inputMode="decimal"
                value={tenderedText}
                onChange={(event) => setTenderedText(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {CASH_SHORTCUTS_MILLIMES.map((amount) => (
                <Button key={amount} onClick={() => setTenderedText(String(amount / 1000))}>
                  <Money millimes={amount} locale={locale} />
                </Button>
              ))}
            </div>
            <p className={`text-4xl ${change >= 0 ? "text-olive" : "text-terracotta"}`}>
              {t("cashier.change")} <Money millimes={Math.max(0, change)} locale={locale} />
            </p>
            {change < 0 ? <p>{t("cashier.short")}</p> : null}
          </div>
        ) : null}
        {paid ? (
          <p className="mt-3 text-4xl text-olive" role="status">
            {t("cashier.change")}{" "}
            <Money millimes={paid.change ?? 0} locale={locale} />
            <span className="mt-2 block text-base text-ink">{paid.notice}</span>
          </p>
        ) : null}
        <Button
          className="mt-4"
          intent="primary"
          disabled={
            blocked ||
            busy ||
            !order ||
            (method === "CASH" && (!tenderedOk || change < 0))
          }
          onClick={() => {
            if (!order) {
              return;
            }
            void run(async () => {
              const result =
                method === "CASH" ? await api.pay(order.id, method, tendered) : await api.pay(order.id, method);
              setPaid({ change: result.payment.changeMillimes, notice: result.notice });
              void queryClient.invalidateQueries({ queryKey: ["orders"] });
              void queryClient.invalidateQueries({ queryKey: ["tables"] });
              void queryClient.invalidateQueries({ queryKey: ["order", order.id] });
            });
          }}
        >
          {t("cashier.pay")}
        </Button>
      </Dialog>
    </div>
  );
}
